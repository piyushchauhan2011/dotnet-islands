using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Admin;

[Route("api/admin")]
[ServiceFilter(typeof(AdminCacheFilter))]
public sealed class AdminCatalogController(
    AdminCatalogQueries queries, AdminCatalogService catalog) : ControllerBase
{
    [HttpGet("{kind}")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> List(string kind) =>
        AdminCatalogQueries.Supports(kind) ? Ok(await queries.ListAsync(kind)) : NotFound();

    [HttpGet("{kind}/{id}")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Item(string kind, string id)
    {
        if (!AdminCatalogQueries.Supports(kind))
            return NotFound();
        var item = await queries.ItemAsync(kind, id);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost("{kind}")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Save(string kind)
    {
        if (!AdminCatalogQueries.Supports(kind))
            return NotFound();
        var (error, input) = await ReadInput();
        if (error is not null)
            return error;
        if (input.ValueKind != JsonValueKind.Object)
            return BadRequest(new
            {
                error = "Content must be an object."
            });
        return Map(await catalog.SaveAsync(kind, input), save: true);
    }

    [HttpPost("{kind}/{id}/publish")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> Publish(string kind, string id)
    {
        if (!AdminCatalogQueries.Supports(kind))
            return NotFound();
        var (error, input) = await ReadInput();
        return error ?? Map(await catalog.PublishAsync(kind, id, input), save: false);
    }

    private async Task<(IActionResult? Error, JsonElement Input)> ReadInput()
    {
        if (!Request.HasJsonContentType())
            return (BadRequest(new
            {
                error = "Expected application/json."
            }), default);
        try
        {
            return (null, await Request.ReadFromJsonAsync<JsonElement>());
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return (BadRequest(new
            {
                error = "Invalid JSON."
            }), default);
        }
    }

    private IActionResult Map(AdminCatalogResult result, bool save) => result.Status switch
    {
        AdminCatalogStatus.Ok => Success(result, save),
        AdminCatalogStatus.NotFound => NotFound(),
        AdminCatalogStatus.Conflict => Conflict(new
        {
            error = "A record with this slug already exists in its catalog scope.",
            field = "slug"
        }),
        AdminCatalogStatus.Validation => new JsonResult(new
        {
            type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
            title = "One or more validation errors occurred.",
            status = 400,
            errors = result.FieldErrors!.ToDictionary(x => x.Key, x => new[] { x.Value })
        })
        {
            StatusCode = 400,
            ContentType = "application/problem+json"
        },
        _ => throw new InvalidOperationException("Unknown catalog result status.")
    };

    private IActionResult Success(AdminCatalogResult result, bool save)
    {
        if (save)
            return Ok(new
            {
                ok = true,
                id = result.Id
            });
        return Ok(new
        {
            ok = true
        });
    }
}
