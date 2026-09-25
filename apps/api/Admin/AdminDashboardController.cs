using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Admin;

[Route("api/admin")]
[ServiceFilter(typeof(AdminCacheFilter))]
public sealed class AdminDashboardController(AdminDashboardQueries queries) : ControllerBase
{
    [HttpGet("dashboard")]
    [ServiceFilter(typeof(AdminRequestFilter))]
    public async Task<IActionResult> GetDashboard(CancellationToken cancellationToken) =>
        Ok(await queries.GetOverviewAsync(cancellationToken));
}
