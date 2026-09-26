using System.Security.Cryptography;
using System.Text;
using Hotel.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Snapshots;

public static class SnapshotGateway
{
    public static void UseSnapshotGateway(this WebApplication app)
    {
        var enabled = app.Configuration["SNAPSHOT_MODE"] == "on" ||
            (!app.Environment.IsDevelopment() && app.Configuration["SNAPSHOT_MODE"] != "off");
        var token = app.Configuration["SNAPSHOT_INTERNAL_TOKEN"];
        if (enabled && (string.IsNullOrWhiteSpace(token) || token.Length < 32))
            throw new InvalidOperationException(
                "SNAPSHOT_INTERNAL_TOKEN (32+ characters) is required for snapshot mode.");

        app.Use((context, next) => ServeRequest(context, next, app, enabled, token));
    }

    private static async Task ServeRequest(
        HttpContext context, RequestDelegate next, WebApplication app, bool enabled, string? token)
    {
        var path = context.Request.Path.Value ?? "/";
        if (path == "/robots.txt")
        {
            await WriteRobots(context, app.Configuration);
            return;
        }
        if (path == "/sitemap.xml")
        {
            await WriteSitemap(context, app.Configuration);
            return;
        }
        if (path == "/_snapshot-source")
        {
            await ServeSource(context, next, token);
            return;
        }
        if (path == "/search" && context.Request.QueryString.HasValue)
        {
            context.Response.Headers.CacheControl = "private, no-store";
            await next(context);
            return;
        }
        if (!enabled || !CanonicalShape(path) ||
            !HttpMethods.IsGet(context.Request.Method) &&
            !HttpMethods.IsHead(context.Request.Method))
        {
            await next(context);
            return;
        }
        await ServeSnapshot(context, path);
    }

    private static async Task WriteRobots(HttpContext context, IConfiguration configuration)
    {
        context.Response.ContentType = "text/plain; charset=utf-8";
        context.Response.Headers.CacheControl = "public, max-age=300";
        var origin = PublicOrigin(context, configuration);
        await context.Response.WriteAsync(
            $"User-agent: *\nDisallow: /admin\nDisallow: /inquire\n" +
            $"Disallow: /_snapshot-source\nSitemap: {origin}/sitemap.xml\n");
    }

    private static async Task ServeSource(
        HttpContext context, RequestDelegate next, string? token)
    {
        var supplied = context.Request.Headers["X-Snapshot-Token"].ToString();
        if (token is null || supplied.Length != token.Length ||
            !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(token)))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        var source = context.Request.Query["path"].ToString();
        if (!CanonicalShape(source))
        {
            context.Response.StatusCode = 404;
            return;
        }
        var db = context.RequestServices.GetRequiredService<HotelDbContext>();
        if (!await db.SnapshotJobs.AnyAsync(job => job.Path == source) &&
            !await db.PageSnapshots.AnyAsync(snapshot => snapshot.Path == source))
        {
            context.Response.StatusCode = 404;
            return;
        }
        context.Response.Headers.CacheControl = "private, no-store";
        context.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        context.Request.Path = source;
        context.Request.QueryString = QueryString.Empty;
        await next(context);
    }

    private static async Task ServeSnapshot(HttpContext context, string path)
    {
        var catalog = context.RequestServices.GetRequiredService<HotelDbContext>();
        var snapshot = await catalog.PageSnapshots.AsNoTracking()
            .FirstOrDefaultAsync(row => row.Path == path);
        if (snapshot is null)
        {
            var queued = await catalog.SnapshotJobs.AsNoTracking()
                .AnyAsync(row => row.Path == path);
            // New pages wait for their first capture; unpublished routes are 404.
            context.Response.StatusCode = queued ||
                path is "/" or "/destinations" or "/blog" or "/search" ? 503 : 404;
            if (context.Response.StatusCode == 503)
                context.Response.Headers.RetryAfter = "5";
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsync(context.Response.StatusCode == 503
                ? "Page is being published. Please retry shortly." : "Page not found.");
            return;
        }
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.Headers.CacheControl =
            "public, max-age=60, stale-while-revalidate=300";
        context.Response.Headers["X-Snapshot-Version"] = snapshot.AssetVersion;
        await context.Response.WriteAsync(snapshot.Html);
    }

    private static string PublicOrigin(HttpContext context, IConfiguration configuration) =>
        configuration["PUBLIC_ORIGIN"]?.TrimEnd('/') ??
        $"{context.Request.Scheme}://{context.Request.Host}";

    private static bool CanonicalShape(string path)
    {
        if (path is "/" or "/destinations" or "/blog" or "/search")
            return true;
        if (path.Length is < 3 or > 300)
            return false;
        if (path.StartsWith("/destinations/", StringComparison.Ordinal))
            return ValidSlug(path.AsSpan("/destinations/".Length));
        if (path.StartsWith("/blog/", StringComparison.Ordinal))
            return ValidSlug(path.AsSpan("/blog/".Length));
        if (!path.StartsWith("/hotels/", StringComparison.Ordinal))
            return false;
        var hotel = path.AsSpan("/hotels/".Length);
        var offer = hotel.IndexOf("/offers/".AsSpan());
        return offer < 0 ? ValidSlug(hotel)
            : ValidSlug(hotel[..offer]) && ValidSlug(hotel[(offer + "/offers/".Length)..]);
    }

    private static bool ValidSlug(ReadOnlySpan<char> slug)
    {
        if (slug.Length is < 1 or > 160 || slug[0] == '-' || slug[^1] == '-')
            return false;
        foreach (var character in slug)
            if (character is not (>= 'a' and <= 'z' or >= '0' and <= '9' or '-'))
                return false;
        return true;
    }

    private static async Task WriteSitemap(HttpContext context, IConfiguration configuration)
    {
        var db = context.RequestServices.GetRequiredService<HotelDbContext>();
        var paths = await SitemapPaths(db);
        var origin = PublicOrigin(context, configuration);
        var escape = System.Security.SecurityElement.Escape;
        context.Response.ContentType = "application/xml; charset=utf-8";
        context.Response.Headers.CacheControl = "public, max-age=300";
        await context.Response.WriteAsync(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
            "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">" +
            string.Concat(paths.Order(StringComparer.Ordinal)
                .Select(path => $"<url><loc>{escape(origin + path)}</loc></url>")) +
            "</urlset>");
    }

    private static async Task<List<string>> SitemapPaths(HotelDbContext db)
    {
        var destinations = await db.Destinations.AsNoTracking()
            .Where(row => row.Status == "published")
            .Select(row => new { row.Id, row.Slug }).ToListAsync();
        var hotels = await db.Hotels.AsNoTracking()
            .Where(row => row.Status == "published")
            .Select(row => new { row.Id, row.DestinationId, row.Slug }).ToListAsync();
        var offers = await db.Offers.AsNoTracking()
            .Where(row => row.Status == "published")
            .Select(row => new { row.HotelId, row.Slug }).ToListAsync();
        var posts = await db.BlogPosts.AsNoTracking()
            .Where(row => row.Status == "published")
            .Select(row => row.Slug).ToListAsync();
        var published = destinations.Select(row => row.Id).ToHashSet(StringComparer.Ordinal);
        var hotelsById = hotels.Where(row => published.Contains(row.DestinationId))
            .ToDictionary(row => row.Id, StringComparer.Ordinal);
        var paths = new List<string> { "/", "/destinations", "/blog", "/search" };
        paths.AddRange(destinations.Select(row => "/destinations/" + row.Slug));
        paths.AddRange(hotelsById.Values.Select(row => "/hotels/" + row.Slug));
        paths.AddRange(offers.Where(row => hotelsById.ContainsKey(row.HotelId))
            .Select(row => $"/hotels/{hotelsById[row.HotelId].Slug}/offers/{row.Slug}"));
        paths.AddRange(posts.Select(slug => "/blog/" + slug));
        return paths;
    }
}
