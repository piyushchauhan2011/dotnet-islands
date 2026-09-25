using Hotel.Api;
using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

AppStartup.LoadDevelopmentEnvironment();
var builder = WebApplication.CreateBuilder(args);
StartupServices.Configure(builder);
var app = builder.Build();
if (await AppStartup.RunDataCommandAsync(app, args))
    return;
StartupMiddleware.Configure(app);
AppStartup.MapEndpoints(app);
await app.RunAsync();

namespace Hotel.Api
{
    internal static class AppStartup
    {
        internal static void LoadDevelopmentEnvironment()
        {
            var localEnv = File.Exists(".env") ? ".env" : Path.GetFullPath("../../.env");
            if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production" ||
                !File.Exists(localEnv))
                return;

            foreach (var line in File.ReadLines(localEnv))
            {
                var entry = line.Trim();
                if (entry.Length == 0 || entry.StartsWith('#'))
                    continue;
                var equals = entry.IndexOf('=');
                if (equals < 1)
                    continue;
                var key = entry[..equals];
                if (Environment.GetEnvironmentVariable(key) is null)
                    Environment.SetEnvironmentVariable(key, entry[(equals + 1)..]);
            }
        }


        internal static async Task<bool> RunDataCommandAsync(WebApplication app, string[] args)
        {
            if (args.FirstOrDefault() is not ("migrate" or "seed"))
                return false;
            await using var scope = app.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<HotelDbContext>();
            await db.Database.MigrateAsync();
            if (args[0] == "seed")
                await SeedDatabase.RunAsync(db, app.Configuration);
            return true;
        }


        internal static void MapEndpoints(WebApplication app)
        {
            app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
            app.MapControllers();
            app.MapRazorPages();
        }
    }
}
