using Hotel.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Public;

[Route("api/search")]
public sealed class SearchApiController(CatalogPageService catalog, HotelDbContext db)
    : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(CancellationToken ct)
    {
        var search = await catalog.Search(Request.Query, ct);
        return Ok(await PublicApiProjection.Search(search, db, ct));
    }
}
