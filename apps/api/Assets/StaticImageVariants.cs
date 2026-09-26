using System.Text.Json;

namespace Hotel.Api.Assets;

public sealed class StaticImageVariants(IWebHostEnvironment environment)
{
    private readonly IReadOnlyDictionary<string, Variant> _variants = Load(environment);

    public Variant? Find(string source) => _variants.GetValueOrDefault(source);

    private static IReadOnlyDictionary<string, Variant> Load(IWebHostEnvironment environment)
    {
        var webRoot = environment.WebRootPath ??
            Path.Combine(environment.ContentRootPath, "wwwroot");
        var path = Path.Combine(webRoot, "images", "image-manifest.json");
        return JsonSerializer.Deserialize<Dictionary<string, Variant>>(
            File.ReadAllBytes(path), JsonSerializerOptions.Web) ??
            throw new InvalidOperationException($"Invalid image manifest: {path}");
    }

    public sealed record Variant(int Width, int Height, string Src, string Avif, string Webp);
}
