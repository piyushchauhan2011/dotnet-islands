using System.Text.Json;
using Hotel.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

[Route("api/admin/inquiries")]
[ServiceFilter(typeof(AdminCacheFilter))]
public sealed class AdminInquiryController(HotelDbContext db) : ControllerBase
{
    [HttpPost("{id}/status")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> UpdateStatus(string id, CancellationToken cancellationToken)
    {
        var (error, status) = await ReadStatus(cancellationToken);
        if (error is not null)
            return error;
        var inquiry = await db.Inquiries.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (inquiry is null)
            return NotFound();
        inquiry.Status = status!;
        inquiry.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(new
        {
            ok = true
        });
    }

    private async Task<(IActionResult? Error, string? Status)> ReadStatus(
        CancellationToken cancellationToken)
    {
        if (!Request.HasJsonContentType())
            return (BadRequest(new
            {
                error = "Expected application/json."
            }), null);
        JsonElement body;
        try
        {
            body = await Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
        }
        catch (Exception ex) when (ex is JsonException or BadHttpRequestException)
        {
            return (BadRequest(new
            {
                error = "Invalid JSON."
            }), null);
        }

        var validation = new AdminValidation(body);
        var status = validation.Enum("status", "new", "contacted", "closed");
        if (validation.Errors.Count > 0)
            return (new JsonResult(new
            {
                type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                title = "One or more validation errors occurred.",
                status = StatusCodes.Status400BadRequest,
                errors = validation.Errors.ToDictionary(
                    pair => pair.Key, pair => new[] { pair.Value }, StringComparer.Ordinal)
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentType = "application/problem+json"
            }, null);

        return (null, status);
    }
}
