package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type job struct{ path, version string }

type worker struct {
	pool                                 *pgxpool.Pool
	browser                              context.Context
	origin, token, runtime, assetVersion string
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	if root := os.Getenv("SNAPSHOT_REPO_ROOT"); root != "" {
		if err := os.Chdir(root); err != nil {
			return err
		}
	}
	loadEnv(".env")
	url, token := os.Getenv("DATABASE_URL"), os.Getenv("SNAPSHOT_INTERNAL_TOKEN")
	if url == "" || len(token) < 32 {
		return errors.New("DATABASE_URL and a 32+ character SNAPSHOT_INTERNAL_TOKEN are required")
	}
	origin := strings.TrimRight(os.Getenv("SNAPSHOT_API_ORIGIN"), "/")
	if origin == "" {
		origin = "http://localhost:5000"
	}
	version, runtime, err := assetFingerprint()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	allocator, closeAllocator := chromedp.NewExecAllocator(ctx, browserOptions()...)
	defer closeAllocator()
	browser, closeBrowser := chromedp.NewContext(allocator)
	defer closeBrowser()
	if err := chromedp.Run(browser); err != nil {
		return err
	}
	w := worker{pool: pool, browser: browser, origin: origin, token: token, runtime: runtime, assetVersion: version}
	if err := w.releaseChangedAssets(ctx); err != nil {
		return err
	}
	once, drain := false, false
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--once":
			once = true
		case "--drain":
			drain = true
		default:
			return fmt.Errorf("unknown argument %q", arg)
		}
	}
	for ctx.Err() == nil {
		results := make(chan error, 2)
		for range 2 {
			go func() { results <- w.work(ctx) }()
		}
		var workError error
		for range 2 {
			if err := <-results; err != nil && ctx.Err() == nil {
				workError = errors.Join(workError, err)
			}
		}
		if workError != nil {
			return workError
		}
		if once {
			break
		}
		select {
		case <-ctx.Done():
		case <-time.After(1500 * time.Millisecond):
		}
	}
	if drain && ctx.Err() == nil {
		var remaining int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM snapshot_jobs").Scan(&remaining); err != nil {
			return err
		}
		if remaining > 0 {
			return fmt.Errorf("%d snapshots remain unpublished", remaining)
		}
	}
	return nil
}

func browserOptions() []chromedp.ExecAllocatorOption {
	options := append([]chromedp.ExecAllocatorOption{}, chromedp.DefaultExecAllocatorOptions[:]...)
	if os.Geteuid() == 0 || os.Getenv("SNAPSHOT_CHROME_NO_SANDBOX") == "1" {
		options = append(options, chromedp.NoSandbox)
	}
	return options
}

func loadEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok || key == "" || strings.HasPrefix(key, "#") {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}

func assetFingerprint() (string, string, error) {
	manifest, err := os.ReadFile("apps/api/wwwroot/assets/manifest.json")
	if err != nil {
		return "", "", err
	}
	hash := sha256.New()
	hash.Write(manifest)
	for _, dir := range []string{"apps/api/Pages", "apps/api/Public", "apps/api/Assets", "apps/api/Snapshots", "apps/snapshot-worker"} {
		err = filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return nil
			}
			if ext := filepath.Ext(path); (ext != ".cs" && ext != ".cshtml" && ext != ".go") ||
				strings.HasSuffix(path, "_test.go") {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			hash.Write([]byte(filepath.ToSlash(path)))
			hash.Write(data)
			return nil
		})
		if err != nil {
			return "", "", err
		}
	}
	for _, path := range []string{"apps/snapshot-worker/go.mod", "apps/snapshot-worker/go.sum"} {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", "", err
		}
		hash.Write([]byte(path))
		hash.Write(data)
	}
	var assets map[string]struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(manifest, &assets); err != nil {
		return "", "", err
	}
	runtime := assets["src/islands/runtime.tsx"].File
	if runtime == "" {
		return "", "", errors.New("missing islands runtime in Vite manifest")
	}
	return hex.EncodeToString(hash.Sum(nil)), "/assets/" + runtime, nil
}

func (w worker) releaseChangedAssets(ctx context.Context) error {
	var version [16]byte
	if _, err := rand.Read(version[:]); err != nil {
		return err
	}
	_, err := w.pool.Exec(ctx, `INSERT INTO snapshot_jobs (path, desired_version, attempts, next_attempt_at, leased_until)
		SELECT path, $1, 0, now(), NULL FROM page_snapshots WHERE asset_version <> $2
		ON CONFLICT (path) DO UPDATE SET desired_version = EXCLUDED.desired_version,
		attempts = 0, next_attempt_at = now(), leased_until = NULL`, hex.EncodeToString(version[:]), w.assetVersion)
	return err
}

func (w worker) claim(ctx context.Context) (job, error) {
	var item job
	err := w.pool.QueryRow(ctx, `WITH next AS (
		SELECT path FROM snapshot_jobs WHERE next_attempt_at <= now()
		AND (leased_until IS NULL OR leased_until < now())
		ORDER BY next_attempt_at, path LIMIT 1 FOR UPDATE SKIP LOCKED
	) UPDATE snapshot_jobs AS job SET leased_until = now() + interval '90 seconds'
	FROM next WHERE job.path = next.path RETURNING job.path, job.desired_version`).Scan(&item.path, &item.version)
	return item, err
}

func (w worker) work(ctx context.Context) error {
	for ctx.Err() == nil {
		item, err := w.claim(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		html, err := w.render(item)
		if err == nil {
			err = w.publish(ctx, item, html)
		}
		if err != nil {
			log.Printf("Snapshot %s: %v", item.path, err)
			if failure := w.fail(ctx, item); failure != nil {
				return failure
			}
		}
	}
	return nil
}

func (w worker) publish(ctx context.Context, item job, html string) error {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var desired string
	err = tx.QueryRow(ctx, "SELECT desired_version FROM snapshot_jobs WHERE path = $1 FOR UPDATE", item.path).Scan(&desired)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if desired != item.version {
		return nil
	}
	_, err = tx.Exec(ctx, `INSERT INTO page_snapshots (path, html, asset_version, generated_at) VALUES ($1,$2,$3,now())
		ON CONFLICT (path) DO UPDATE SET html=EXCLUDED.html, asset_version=EXCLUDED.asset_version, generated_at=now()`, item.path, html, w.assetVersion)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM snapshot_jobs WHERE path = $1", item.path); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	log.Printf("Published %s (%s)", item.path, w.assetVersion[:10])
	return nil
}

func (w worker) fail(ctx context.Context, item job) error {
	_, err := w.pool.Exec(ctx, `UPDATE snapshot_jobs SET attempts = attempts + 1, leased_until = NULL,
		next_attempt_at = now() + (LEAST(3600, POWER(2, LEAST(attempts, 11)))::text || ' seconds')::interval
		WHERE path = $1 AND desired_version = $2`, item.path, item.version)
	return err
}
