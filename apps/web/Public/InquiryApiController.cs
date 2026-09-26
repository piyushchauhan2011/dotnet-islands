using System.Text.Json;
using Hotel.Web.Admin;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Web.Public;

[Route("api")]
public sealed class InquiryApiController(
    CatalogPageService catalog, InquirySubmissionService submissions) : ControllerBase
{
    [HttpGet("inquiry-context")]
    public async Task<IActionResult> Context(CancellationToken ct)
    {
        var hotelId = Request.Query["hotel"].ToString();
        if (string.IsNullOrEmpty(hotelId))
            return BadRequest(new
            {
                fieldErrors = new
                {
                    hotel = new[] { "Hotel is required" }
                }
            });

        var context = await catalog.Inquiry(
            hotelId, Request.Query["room"].ToString(), Request.Query["offer"].ToString(), ct);
        if (context is null)
            return NotFound();

        var hotel = context.Hotel;
        return Ok(new
        {
            hotel.Id,
            hotel.DestinationId,
            hotel.Name,
            hotel.Slug,
            hotel.PropertyType,
            hotel.Address,
            hotel.Summary,
            hotel.Description,
            hotel.HeroImage,
            hotel.Rating,
            hotel.StarRating,
            hotel.ReviewCount,
            hotel.PriceFrom,
            hotel.Currency,
            hotel.Latitude,
            hotel.Longitude,
            hotel.SeoTitle,
            hotel.SeoDescription,
            hotel.Status,
            hotel.PublishedAt,
            hotel.CreatedAt,
            hotel.UpdatedAt,
            selectedRoom = context.Room,
            selectedOffer = context.Offer
        });
    }

    [HttpPost("inquiries")]
    public async Task<IActionResult> Submit(CancellationToken ct)
    {
        if (!AdminApi.RequireCsrf(HttpContext))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Invalid CSRF token"
            });

        JsonDocument payload;
        try
        {
            payload = await JsonDocument.ParseAsync(Request.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return InvalidBody();
        }

        using (payload)
        {
            if (payload.RootElement.ValueKind != JsonValueKind.Object)
                return InvalidBody();

            var result = await submissions.SubmitAsync(payload.RootElement, ct);
            if (result.FieldErrors.Count != 0)
                return BadRequest(new
                {
                    fieldErrors = result.FieldErrors
                });

            var id = result.Id!;
            return Ok(new
            {
                id,
                reference = id[..8].ToUpperInvariant(),
                message = "Inquiry received. This is not a reservation; no payment has been taken."
            });
        }
    }

    private IActionResult InvalidBody() => BadRequest(new
    {
        fieldErrors = new
        {
            body = new[] { "Valid JSON object is required" }
        }
    });
}
