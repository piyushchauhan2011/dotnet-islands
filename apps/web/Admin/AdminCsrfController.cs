using System.Security.Cryptography;
using Microsoft.AspNetCore.Mvc;

namespace Hotel.Api.Admin;

[Route("api/csrf")]
public sealed class AdminCsrfController(IHostEnvironment environment) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        Response.Cookies.Append(AdminApi.CsrfCookie, token, new CookieOptions
        {
            HttpOnly = false,
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            IsEssential = true,
            Path = "/"
        });
        Response.Headers.CacheControl = "private, no-store";
        return Ok(new
        {
            csrfToken = token
        });
    }
}
