using System.Security.Cryptography;
using System.Text;

namespace Hotel.Api.Admin;

public static class AdminApi
{
    internal const string CsrfCookie = "hotel-csrf";

    public static IServiceCollection AddAdminServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment) =>
        AdminSecurityConfiguration.Configure(services, configuration, environment);

    // Double-submit cookie plus matching custom header prevents cross-site form mutations.
    public static bool RequireCsrf(HttpContext context)
    {
        if (!context.Request.Cookies.TryGetValue(CsrfCookie, out var cookie)
            || !context.Request.Headers.TryGetValue("X-CSRF-Token", out var header))
            return false;
        var sent = header.ToString();
        if (string.IsNullOrEmpty(cookie) || sent.Length != cookie.Length || cookie.Length > 256)
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(sent), Encoding.UTF8.GetBytes(cookie));
    }


    internal static void DeleteCsrfCookie(HttpContext context) =>
        context.Response.Cookies.Delete(CsrfCookie);

}
