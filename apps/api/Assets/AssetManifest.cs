using System.Security.Cryptography;
using System.Text.Json;

namespace Hotel.Api.Assets;

public interface IAssetManifest
{
    string RuntimeScript
    {
        get;
    }
    IReadOnlyList<string> RuntimeStyles
    {
        get;
    }
    string? AdminScript
    {
        get;
    }
    IReadOnlyList<string> AdminStyles
    {
        get;
    }
    string AssetVersion
    {
        get;
    }
}

public sealed class AssetManifest : IAssetManifest
{
    public string RuntimeScript
    {
        get;
    }
    public IReadOnlyList<string> RuntimeStyles
    {
        get;
    }
    public string? AdminScript
    {
        get;
    }
    public IReadOnlyList<string> AdminStyles
    {
        get;
    }
    public string AssetVersion
    {
        get;
    }

    public AssetManifest(IWebHostEnvironment environment, IConfiguration configuration)
    {
        if (configuration["ASSET_MODE"] == "vite" && environment.IsDevelopment())
        {
            RuntimeScript = "http://localhost:3000/src/islands/runtime.tsx";
            RuntimeStyles = [];
            AdminScript = "http://localhost:3000/src/admin/main.tsx";
            AdminStyles = [];
            AssetVersion = "vite-development";
            return;
        }

        var webRoot = environment.WebRootPath ??
            Path.Combine(environment.ContentRootPath, "wwwroot");
        var path = Path.Combine(webRoot, "assets", "manifest.json");
        if (!File.Exists(path))
            throw new InvalidOperationException(
                $"Build client assets before serving pages: {path}");
        var bytes = File.ReadAllBytes(path);
        AssetVersion = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var document = JsonDocument.Parse(bytes);
        RuntimeScript = AssetUrl(document.RootElement.GetProperty("src/islands/runtime.tsx"));
        RuntimeStyles = ResolveStyles(document.RootElement, "src/islands/runtime.tsx");
        AdminStyles = document.RootElement.TryGetProperty("src/admin/main.tsx", out _)
            ? ResolveStyles(document.RootElement, "src/admin/main.tsx") : [];
        AdminScript = document.RootElement.TryGetProperty("src/admin/main.tsx", out var admin)
            ? AssetUrl(admin) : null;
    }

    private static string AssetUrl(JsonElement entry) =>
        "/assets/" + entry.GetProperty("file").GetString();

    private static IReadOnlyList<string> ResolveStyles(JsonElement manifest, string entry)
    {
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var css = new HashSet<string>(StringComparer.Ordinal);
        void Visit(string key)
        {
            if (!visited.Add(key) || !manifest.TryGetProperty(key, out var chunk))
                return;
            if (chunk.TryGetProperty("imports", out var imports))
                foreach (var imported in imports.EnumerateArray())
                    if (imported.GetString() is { } name)
                        Visit(name);
            if (chunk.TryGetProperty("css", out var styles))
                foreach (var style in styles.EnumerateArray())
                    if (style.GetString() is { } name)
                        css.Add("/assets/" + name);
        }
        Visit(entry);
        return css.ToArray();
    }
}
