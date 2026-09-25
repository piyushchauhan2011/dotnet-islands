using Hotel.Api.Admin;
using Hotel.Api.Assets;
using Hotel.Api.Data;
using Hotel.Api.Public;
using Hotel.Api.Snapshots;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Npgsql;

namespace Hotel.Api;

internal static class StartupServices
{
    internal static void Configure(WebApplicationBuilder builder)
    {
        var connection = DatabaseConnection(builder.Configuration["DATABASE_URL"]);
        builder.Services.AddDbContext<HotelDbContext>(options => options.UseNpgsql(connection));
        builder.Services.AddAdminServices(builder.Configuration, builder.Environment);
        builder.Services.AddRazorPages();
        builder.Services.AddControllers();
        builder.Services.AddSingleton<IAssetManifest, AssetManifest>();
        builder.Services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["image/svg+xml"]);
        });
        builder.Services.AddScoped<CatalogPageService>();
        builder.Services.AddScoped<InquirySubmissionService>();
        builder.Services.AddScoped<AdminCatalogService>();
        builder.Services.AddScoped<AdminCatalogQueries>();
        builder.Services.AddScoped<AdminDashboardQueries>();
        builder.Services.AddScoped<AdminSessionService>();
        builder.Services.AddScoped<AdminMediaService>();
        builder.Services.AddScoped<AdminCacheFilter>();
        builder.Services.AddScoped<AdminRequestFilter>();
    }

    private static string DatabaseConnection(string? databaseUrl)
    {
        var uri = new Uri(databaseUrl ??
            throw new InvalidOperationException("DATABASE_URL is required."));
        if (uri.Scheme is not ("postgresql" or "postgres"))
            throw new InvalidOperationException("DATABASE_URL must use postgresql://.");
        var credentials = uri.UserInfo.Split(':', 2);
        if (credentials.Length != 2 || uri.AbsolutePath.Length < 2)
            throw new InvalidOperationException(
                "DATABASE_URL requires a user, password and database.");
        var connection = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = Uri.UnescapeDataString(credentials[1]),
        };
        return connection.ConnectionString;
    }
}

internal static class StartupMiddleware
{
    private const string ImmutableCacheControl = "public, max-age=31536000, immutable";

    internal static void Configure(WebApplication app)
    {
        app.UseWhen(ShouldCompress, branch => branch.UseResponseCompression());
        app.UseSnapshotGateway();
        app.UseRouting();
        UseAssetFiles(app);
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                var path = context.Context.Request.Path;
                if (path.StartsWithSegments("/assets/assets") ||
                    path.StartsWithSegments("/images/gen"))
                    context.Context.Response.Headers.CacheControl = ImmutableCacheControl;
            }
        });
        app.UseAuthentication();
        app.UseAuthorization();
    }

    private static bool ShouldCompress(HttpContext context) =>
        HttpMethods.IsGet(context.Request.Method) &&
        !context.Request.Path.StartsWithSegments("/api") &&
        !context.Request.Path.StartsWithSegments("/admin") &&
        !context.Request.Path.StartsWithSegments("/inquire") &&
        !context.Request.Path.StartsWithSegments("/media");

    private static void UseAssetFiles(WebApplication app)
    {
        if (app.Configuration["ASSET_DIR"] is not { Length: > 0 } assetDirectory)
            return;
        Directory.CreateDirectory(assetDirectory);
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(Path.GetFullPath(assetDirectory)),
            RequestPath = "/assets",
            OnPrepareResponse = context =>
            {
                if (context.Context.Request.Path.StartsWithSegments("/assets/assets"))
                    context.Context.Response.Headers.CacheControl = ImmutableCacheControl;
            }
        });
    }
}
