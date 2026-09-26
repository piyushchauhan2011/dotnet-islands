using System.Text.Json;
using Hotel.Web.Data;
using ImageMagick;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Admin;

internal sealed record AdminMediaUpload(
    string Filename, string MimeType, string Alt, string? Caption, byte[] Bytes);

internal sealed record AdminMediaUploadResult(
    string? Id = null, Dictionary<string, string>? Variants = null, string? Error = null);

internal sealed record AdminMediaFile(string Path, string ContentType);

public sealed class AdminMediaService(HotelDbContext db, IConfiguration configuration)
{
    private const int MaxImageBytes = 10 * 1024 * 1024;
    private static readonly Dictionary<string, (string Extension, MagickFormat Format)> Types =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["image/jpeg"] = ("jpg", MagickFormat.Jpeg),
            ["image/png"] = ("png", MagickFormat.Png),
            ["image/webp"] = ("webp", MagickFormat.WebP),
            ["image/avif"] = ("avif", MagickFormat.Avif)
        };
    private static readonly Dictionary<string, uint> Widths = new(StringComparer.Ordinal)
    {
        ["thumbnail"] = 240,
        ["small"] = 480,
        ["medium"] = 960,
        ["large"] = 1600
    };

    internal static string[] AllowedMimeTypes { get; } = Types.Keys.ToArray();
    internal static bool IsAllowedVariant(string variant) =>
        variant == "original" || Widths.ContainsKey(variant);

    internal async Task<AdminMediaUploadResult> SaveAsync(AdminMediaUpload upload)
    {
        var (filename, mimeType, alt, caption, bytes) = upload;
        if (filename.Length is < 1 or > 240 || alt.Length is < 2 or > 240
            || caption?.Length > 500)
            return new(Error: "Filename, alternative text or caption is invalid.");
        if (!Types.TryGetValue(mimeType, out var requestedType))
            return new(Error: "Only JPEG, PNG, WebP and AVIF images are supported.");
        if (bytes.Length is 0 or > MaxImageBytes)
            return new(Error: "Images must be no larger than 10 MB.");

        MagickImage source;
        try
        {
            source = new MagickImage(bytes);
        }
        catch (MagickException)
        {
            return new(Error: "The uploaded file is not a supported image.");
        }
        using var decoded = source;
        if (decoded.Format != requestedType.Format)
            return new(Error: "Image content does not match its MIME type.");
        try
        {
            decoded.AutoOrient();
        }
        catch (MagickException)
        {
            return new(Error: "The uploaded file is not a supported image.");
        }
        if (decoded.Width == 0 || decoded.Height == 0
            || (long)decoded.Width * decoded.Height > 40_000_000)
            return new(Error: "Image dimensions must be at most 40 megapixels.");

        return await PersistAsync(upload, decoded, requestedType.Extension);
    }

    private async Task<AdminMediaUploadResult> PersistAsync(
        AdminMediaUpload upload, MagickImage decoded, string extension)
    {
        var (filename, mimeType, alt, caption, bytes) = upload;
        var id = Guid.NewGuid().ToString();
        var mediaRoot = Path.GetFullPath(configuration["MEDIA_DIR"] ?? "./data/media");
        var directory = Path.Combine(mediaRoot, id);
        var variants = Widths.Keys.ToDictionary(
            key => key, key => $"/media/{id}/{key}", StringComparer.Ordinal);
        variants["original"] = $"/media/{id}/original";
        Directory.CreateDirectory(directory);
        try
        {
            await System.IO.File.WriteAllBytesAsync(
                Path.Combine(directory, $"original.{extension}"), bytes);
            WriteVariants(decoded, directory);
            var now = DateTime.UtcNow;
            db.MediaAssets.Add(new MediaAsset
            {
                Id = id,
                Filename = filename,
                MimeType = mimeType,
                Width = checked((int)decoded.Width),
                Height = checked((int)decoded.Height),
                Alt = alt,
                Caption = string.IsNullOrWhiteSpace(caption) ? null : caption,
                Variants = JsonSerializer.SerializeToDocument(variants),
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();
            return new(Id: id, Variants: variants);
        }
        catch
        {
            Directory.Delete(directory, recursive: true);
            throw;
        }
    }

    private static void WriteVariants(MagickImage decoded, string directory)
    {
        foreach (var (name, width) in Widths)
        {
            using var image = decoded.Clone();
            image.Strip();
            if (image.Width > width)
                image.Resize(width, 0);
            image.Quality = name == "thumbnail" ? 76u : 84u;
            image.Format = MagickFormat.WebP;
            image.Write(Path.Combine(directory, $"{name}.webp"));
        }
    }

    internal async Task<AdminMediaFile?> FindFileAsync(string assetId, string variant)
    {
        if (!IsAllowedVariant(variant))
            return null;
        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == assetId);
        if (asset is null || !Types.TryGetValue(asset.MimeType, out var type))
            return null;
        var file = variant == "original" ? $"original.{type.Extension}" : $"{variant}.webp";
        var path = Path.Combine(
            Path.GetFullPath(configuration["MEDIA_DIR"] ?? "./data/media"), assetId, file);
        return System.IO.File.Exists(path)
            ? new AdminMediaFile(path, variant == "original" ? asset.MimeType : "image/webp")
            : null;
    }
}
