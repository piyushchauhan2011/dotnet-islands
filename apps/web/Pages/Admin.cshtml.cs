using System.Security.Claims;
using Hotel.Web.Assets;
using Hotel.Web.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Pages;

public sealed class AdminPageModel(HotelDbContext db, IAssetManifest assets) : PageModel
{
    public async Task<IActionResult> OnGetAsync()
    {
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";

        var login = Request.Path == "/admin/login";
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var authorized = id is not null && await db.AdminUsers.AnyAsync(user => user.Id == id);
        if (!login && !authorized)
            return Redirect("/admin/login");
        if (login && authorized)
            return Redirect("/admin");
        if (assets.AdminScript is null)
            return StatusCode(503);
        return Page();
    }
}
