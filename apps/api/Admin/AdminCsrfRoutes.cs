using System.Security.Cryptography;

namespace Hotel.Api.Admin;

internal static class AdminCsrfRoutes
{
    internal static void MapCsrf(WebApplication app)
    {
        app.MapGet("/api/csrf", (HttpContext context, IHostEnvironment environment) =>
        {
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            context.Response.Cookies.Append(AdminApi.CsrfCookie, token, new CookieOptions
            {
                HttpOnly = false,
                Secure = !environment.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                IsEssential = true,
                Path = "/"
            });
            context.Response.Headers.CacheControl = "private, no-store";
            return Results.Ok(new
            {
                csrfToken = token
            });
        });
    }
}
