using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;

namespace Hotel.Web.Admin;

internal static class AdminSecurityConfiguration
{
    internal static IServiceCollection Configure(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        if (!environment.IsDevelopment() && string.IsNullOrWhiteSpace(configuration["MEDIA_DIR"]))
            throw new InvalidOperationException(
                "MEDIA_DIR must point to persistent storage outside Development.");
        var mediaRoot = Path.GetFullPath(configuration["MEDIA_DIR"] ?? "./data/media");
        var keysPath = Path.GetFullPath(
            configuration["DATA_PROTECTION_KEYS_DIR"] ?? Path.Combine(mediaRoot, ".keys"));
        Directory.CreateDirectory(keysPath);
        services.AddDataProtection().SetApplicationName("ElsewhereHotel")
            .PersistKeysToFileSystem(new DirectoryInfo(keysPath));
        const string authScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        services.AddAuthentication(authScheme).AddCookie(authScheme, options =>
        {
            options.Cookie.Name = "hotel-admin";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = environment.IsDevelopment()
                ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.ExpireTimeSpan = TimeSpan.FromHours(12);
            options.SlidingExpiration = false;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = 401;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = 403;
                return Task.CompletedTask;
            };
        });
        services.AddAuthorization();
        return services;
    }
}
