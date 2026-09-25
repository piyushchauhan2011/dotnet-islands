using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Admin;

public sealed class AdminMediaController(AdminMediaService media) : ControllerBase
{
    private const int MaxImageBytes = 10 * 1024 * 1024;

    [HttpPost("/api/admin/media")]
    [ServiceFilter(typeof(AdminCacheFilter))]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Upload()
    {
        var bodyLimit = HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (bodyLimit is { IsReadOnly: false })
            bodyLimit.MaxRequestBodySize = 14_100_000;
        var (error, upload) = Request.HasFormContentType
            ? await ReadForm(Request)
            : await ReadJson(Request);
        if (error is not null)
            return error;
        var result = await media.SaveAsync(upload!);
        return result.Error is { } message
            ? BadRequest(new
            {
                error = message
            })
            : Ok(new
            {
                ok = true,
                id = result.Id,
                variants = result.Variants
            });
    }

    [HttpGet("/media/{assetId}/{variant}")]
    public async Task<IActionResult> Serve(string assetId, string variant)
    {
        if (!Guid.TryParse(assetId, out var parsed) || parsed.ToString() != assetId
            || !AdminMediaService.IsAllowedVariant(variant))
            return NotFound();
        var file = await media.FindFileAsync(assetId, variant);
        if (file is null)
            return NotFound();
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return PhysicalFile(file.Path, file.ContentType, enableRangeProcessing: true);
    }

    private static async Task<(IActionResult? Error, AdminMediaUpload? Data)> ReadForm(
        HttpRequest request)
    {
        if (request.ContentLength > MaxImageBytes + 65536)
            return (new BadRequestObjectResult(new
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
            return (new BadRequestObjectResult(new
            {
                error = "Invalid upload form."
            }), null);
        }
        var file = form.Files.GetFile("file");
        if (file is null || file.Length is 0 or > MaxImageBytes)
            return (new BadRequestObjectResult(new
            {
                error = "Select an image no larger than 10 MB."
            }), null);
        var bytes = new byte[checked((int)file.Length)];
        await using var stream = file.OpenReadStream();
        await stream.ReadExactlyAsync(bytes);
        return (null, new AdminMediaUpload(file.FileName, file.ContentType,
            form["alt"].ToString().Trim(), form["caption"].ToString().Trim(), bytes));
    }

    private static async Task<(IActionResult? Error, AdminMediaUpload? Data)> ReadJson(
        HttpRequest request)
    {
        if (request.ContentLength > 14_100_000)
            return (new BadRequestObjectResult(new
            {
                error = "Images must be no larger than 10 MB."
            }), null);
        if (!request.HasJsonContentType())
            return (new BadRequestObjectResult(new
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
            return (new BadRequestObjectResult(new
            {
                error = "Invalid JSON."
            }), null);
        }
        var validation = new AdminValidation(body);
        var filename = validation.Text("filename", 1, 240);
        var mimeType = validation.Enum("mimeType", AdminMediaService.AllowedMimeTypes);
        var alt = validation.Text("alt", 2, 240);
        var caption = validation.OptionalText("caption", 0, 500);
        var encoded = validation.Text("base64", 1, 14_000_000);
        if (validation.Errors.Count > 0)
            return (ValidationError(validation.Errors), null);
        try
        {
            return (null, new AdminMediaUpload(filename, mimeType, alt, caption,
                Convert.FromBase64String(encoded)));
        }
        catch (FormatException)
        {
            return (ValidationError(new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["base64"] = "Invalid image encoding."
            }), null);
        }
    }

    private static IActionResult ValidationError(IReadOnlyDictionary<string, string> errors) =>
        new JsonResult(new HttpValidationProblemDetails(errors.ToDictionary(
            pair => pair.Key, pair => new[] { pair.Value }, StringComparer.Ordinal)))
        {
            StatusCode = StatusCodes.Status400BadRequest
        };
}
