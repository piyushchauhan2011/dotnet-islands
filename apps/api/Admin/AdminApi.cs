using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

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

    private static IResult? CsrfError(HttpContext context) =>
        RequireCsrf(context) ? null : Results.Json(
            new
            {
                error = "Invalid CSRF token."
            }, statusCode: 403);
    internal static async Task<AdminUser?> CurrentUser(HttpContext context, HotelDbContext db)
    {
        var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return id is null ? null : await db.AdminUsers.AsNoTracking()
            .FirstOrDefaultAsync(user => user.Id == id);
    }
    private static async Task<IResult?> RequireUser(HttpContext context, HotelDbContext db) =>
        await CurrentUser(context, db) is null ? Results.Unauthorized() : null;

    public static void MapAdminApi(this WebApplication app)
    {
        AdminCsrfRoutes.MapCsrf(app);
        var admin = app.MapGroup("/api/admin");
        admin.AddEndpointFilter(async (invocation, next) =>
        {
            invocation.HttpContext.Response.Headers.CacheControl = "private, no-store";
            return await next(invocation);
        });
        AdminAuthRoutes.MapAuth(admin);
        AdminDashboardRoutes.MapDashboard(admin);
        AdminCatalogRoutes.MapCatalog(admin);
        AdminInquiryRoutes.MapInquiry(admin);
        admin.MapPost("/media", AdminMedia.Upload);
        app.MapGet("/media/{assetId}/{variant}", AdminMedia.Serve);
    }

    internal static void DeleteCsrfCookie(HttpContext context) =>
        context.Response.Cookies.Delete(CsrfCookie);

    internal static IResult ValidationError(IReadOnlyDictionary<string, string> errors) =>
        Results.ValidationProblem(errors.ToDictionary(
            pair => pair.Key, pair => new[] { pair.Value }));
    internal static Task<IResult?> AuthError(HttpContext context, HotelDbContext db) =>
        RequireUser(context, db);
    internal static IResult? MutationError(HttpContext context) => CsrfError(context);
}
