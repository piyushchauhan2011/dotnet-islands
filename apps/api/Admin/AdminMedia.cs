using System.Text.Json;
using Hotel.Api.Data;
using ImageMagick;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

internal static class AdminMedia
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
    private static readonly string[] AllowedMimeTypes = Types.Keys.ToArray();
    private static readonly Dictionary<string, uint> Widths = new(StringComparer.Ordinal)
    {
        ["thumbnail"] = 240,
        ["small"] = 480,
        ["medium"] = 960,
        ["large"] = 1600
    };

    public static async Task<IResult> Upload(
        HttpContext context, HotelDbContext db, IConfiguration configuration)
    {
        if (await AdminApi.AuthError(context, db) is { } unauthorized)
            return unauthorized;
        if (AdminApi.MutationError(context) is { } csrf)
            return csrf;
        var bodyLimit = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (bodyLimit is { IsReadOnly: false })
            bodyLimit.MaxRequestBodySize = 14_100_000;
        var (error, upload) = context.Request.HasFormContentType
            ? await ReadForm(context.Request)
            : await ReadJson(context.Request);
        if (error is not null)
            return error;
        var (filename, mimeType, alt, caption, bytes) = upload!;
        if (filename.Length is < 1 or > 240 || alt.Length is < 2 or > 240
            || caption?.Length > 500)
            return Results.BadRequest(new
            {
                error = "Filename, alternative text or caption is invalid."
            });
        if (!Types.TryGetValue(mimeType, out var requestedType))
            return Results.BadRequest(new
            {
                error = "Only JPEG, PNG, WebP and AVIF images are supported."
            });
        if (bytes.Length is 0 or > MaxImageBytes)
            return Results.BadRequest(new
            {
                error = "Images must be no larger than 10 MB."
            });
        return await StoreImage(upload, requestedType, db, configuration);
    }

    private sealed record UploadData(
        string Filename, string MimeType, string Alt, string? Caption, byte[] Bytes);

    private static async Task<(IResult? Error, UploadData? Data)> ReadForm(HttpRequest request)
    {
        if (request.ContentLength > MaxImageBytes + 65536)
            return (Results.BadRequest(new
            {
                error = "Images must be no larger than 10 MB."
            }), null);
        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync();
        }
        catch (InvalidDataException)
        {
            return (Results.BadRequest(new
            {
                error = "Invalid upload form."
            }), null);
        }
        var file = form.Files.GetFile("file");
        if (file is null || file.Length is 0 or > MaxImageBytes)
            return (Results.BadRequest(new
            {
                error = "Select an image no larger than 10 MB."
            }), null);
        var bytes = new byte[checked((int)file.Length)];
        await using var stream = file.OpenReadStream();
        await stream.ReadExactlyAsync(bytes);
        return (null, new UploadData(file.FileName, file.ContentType,
            form["alt"].ToString().Trim(), form["caption"].ToString().Trim(), bytes));
    }

    private static async Task<(IResult? Error, UploadData? Data)> ReadJson(HttpRequest request)
    {
        if (request.ContentLength > 14_100_000)
            return (Results.BadRequest(new
            {
                error = "Images must be no larger than 10 MB."
            }), null);
        if (!request.HasJsonContentType())
            return (Results.BadRequest(new
            {
                error = "Expected application/json or multipart/form-data."
            }), null);
        JsonElement body;
        try
        {
            body = await request.ReadFromJsonAsync<JsonElement>();
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return (Results.BadRequest(new
            {
                error = "Invalid JSON."
            }), null);
        }
        var validation = new AdminValidation(body);
        var filename = validation.Text("filename", 1, 240);
        var mimeType = validation.Enum("mimeType", AllowedMimeTypes);
        var alt = validation.Text("alt", 2, 240);
        var caption = validation.OptionalText("caption", 0, 500);
        var encoded = validation.Text("base64", 1, 14_000_000);
        if (validation.Errors.Count > 0)
            return (AdminApi.ValidationError(validation.Errors), null);
        try
        {
            return (null, new UploadData(filename, mimeType, alt, caption,
                Convert.FromBase64String(encoded)));
        }
        catch (FormatException)
        {
            return (AdminApi.ValidationError(new Dictionary<string, string>
            {
                ["base64"] = "Invalid image encoding."
            }), null);
        }
    }

    private static async Task<IResult> StoreImage(
        UploadData upload, (string Extension, MagickFormat Format) requestedType,
        HotelDbContext db, IConfiguration configuration)
    {
        var (filename, mimeType, alt, caption, bytes) = upload;
        MagickImage source;
        try
        {
            source = new MagickImage(bytes);
        }
        catch (MagickException)
        {
            return Results.BadRequest(new
            {
                error = "The uploaded file is not a supported image."
            });
        }
        using var decoded = source;
        if (decoded.Format != requestedType.Format)
            return Results.BadRequest(new
            {
                error = "Image content does not match its MIME type."
            });
        try
        {
            decoded.AutoOrient();
        }
        catch (MagickException)
        {
            return Results.BadRequest(new
            {
                error = "The uploaded file is not a supported image."
            });
        }
        if (decoded.Width == 0 || decoded.Height == 0
            || (long)decoded.Width * decoded.Height > 40_000_000)
            return Results.BadRequest(new
            {
                error = "Image dimensions must be at most 40 megapixels."
            });
        return await PersistImage(upload, requestedType.Extension, decoded, db, configuration);
    }

    private static async Task<IResult> PersistImage(
        UploadData upload, string extension, MagickImage decoded,
        HotelDbContext db, IConfiguration configuration)
    {
        var (filename, mimeType, alt, caption, bytes) = upload;
        var imageWidth = checked((int)decoded.Width);
        var imageHeight = checked((int)decoded.Height);
        var id = Guid.NewGuid().ToString();
        var mediaRoot = Path.GetFullPath(configuration["MEDIA_DIR"] ?? "./data/media");
        var directory = Path.Combine(mediaRoot, id);
        var variants = Widths.Keys.ToDictionary(key => key, key => $"/media/{id}/{key}");
        variants["original"] = $"/media/{id}/original";
        Directory.CreateDirectory(directory);
        try
        {
            await File.WriteAllBytesAsync(Path.Combine(directory, $"original.{extension}"), bytes);
            WriteVariants(decoded, directory);
            var now = DateTime.UtcNow;
            db.MediaAssets.Add(new MediaAsset
            {
                Id = id,
                Filename = filename,
                MimeType = mimeType,
                Width = imageWidth,
                Height = imageHeight,
                Alt = alt,
                Caption = string.IsNullOrWhiteSpace(caption) ? null : caption,
                Variants = JsonSerializer.SerializeToDocument(variants),
                CreatedAt = now,
                UpdatedAt = now
            });
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                ok = true,
                id,
                variants
            });
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

    public static async Task<IResult> Serve(
        string assetId, string variant, HttpContext context, HotelDbContext db,
        IConfiguration configuration)
    {
        if (!Guid.TryParse(assetId, out var parsed) || parsed.ToString() != assetId
            || variant != "original" && !Widths.ContainsKey(variant))
            return Results.NotFound();
        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(x => x.Id == assetId);
        if (asset is null || !Types.TryGetValue(asset.MimeType, out var type))
            return Results.NotFound();
        var file = variant == "original" ? $"original.{type.Extension}" : $"{variant}.webp";
        var path = Path.Combine(
            Path.GetFullPath(configuration["MEDIA_DIR"] ?? "./data/media"), assetId, file);
        if (!File.Exists(path))
            return Results.NotFound();
        context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return Results.File(path, variant == "original" ? asset.MimeType : "image/webp",
            enableRangeProcessing: true);
    }
}
