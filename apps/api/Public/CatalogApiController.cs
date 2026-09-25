using Hotel.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Public;

[Route("api")]
public sealed class CatalogApiController(CatalogPageService catalog, HotelDbContext db)
    : ControllerBase
{
    [HttpGet("home")]
    public async Task<IActionResult> Home(CancellationToken ct) =>
        Ok(PublicApiProjection.Home(await catalog.Home(ct)));

    [HttpGet("destinations")]
    public async Task<IActionResult> Destinations(CancellationToken ct) =>
        Ok(await catalog.Destinations(ct));

    [HttpGet("destinations/{slug}")]
    public async Task<IActionResult> Destination(string slug, CancellationToken ct)
    {
        var destination = await catalog.Destination(slug, ct);
        return destination is null ? NotFound() : Ok(PublicApiProjection.Destination(destination));
    }

    [HttpGet("hotels/{slug}")]
    public async Task<IActionResult> Hotel(string slug, CancellationToken ct)
    {
        var hotel = await catalog.Hotel(slug, ct);
        return hotel is null ? NotFound() : Ok(await PublicApiProjection.Hotel(hotel, db, ct));
    }

    [HttpGet("hotels/{slug}/offers/{offerSlug}")]
    public async Task<IActionResult> Offer(string slug, string offerSlug, CancellationToken ct)
    {
        var offer = await catalog.Offer(slug, offerSlug, ct);
        return offer is null ? NotFound() : Ok(PublicApiProjection.Offer(offer));
    }

    [HttpGet("posts")]
    public async Task<IActionResult> Posts(CancellationToken ct) =>
        Ok(await catalog.Posts(ct));

    [HttpGet("posts/{slug}")]
    public async Task<IActionResult> Post(string slug, CancellationToken ct)
    {
        var post = await catalog.Post(slug, ct);
        return post is null ? NotFound() : Ok(PublicApiProjection.Post(post));
    }
}
