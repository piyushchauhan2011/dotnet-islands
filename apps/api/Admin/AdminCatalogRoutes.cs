using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

internal static class AdminCatalogRoutes
{
    private static readonly HashSet<string> Kinds =
        ["destinations", "hotels", "rooms", "offers", "posts"];
    internal static void MapCatalog(RouteGroupBuilder admin)
    {
        MapCatalogList(admin);
        MapCatalogItem(admin);
        admin.MapPost("/{kind}", AdminContent.Save);
        admin.MapPost("/{kind}/{id}/publish", AdminContent.Publish);
    }

    private static void MapCatalogList(RouteGroupBuilder admin)
    {
        admin.MapGet("/{kind}", async (string kind, HttpContext context, HotelDbContext db) =>
        {
            if (await AdminApi.AuthError(context, db) is { } error)
                return error;
            if (!Kinds.Contains(kind))
                return Results.NotFound();
            context.Response.Headers.CacheControl = "private, no-store";
            var rows = await ListRows(kind, db);
            return Results.Ok(rows);
        });
    }

    private static async Task<object> ListRows(string kind, HotelDbContext db) =>
        kind switch
        {
            "destinations" => await db.Destinations.OrderBy(x => x.Name).ToListAsync(),
            "hotels" => await db.Hotels.OrderBy(x => x.Name).ToListAsync(),
            "rooms" => await db.Rooms.OrderBy(x => x.Name).ToListAsync(),
            "offers" => await db.Offers.OrderBy(x => x.Title).ToListAsync(),
            _ => await db.BlogPosts.OrderByDescending(x => x.UpdatedAt).ToListAsync()
        };

    private static void MapCatalogItem(RouteGroupBuilder admin)
    {
        admin.MapGet("/{kind}/{id}",
            async (string kind, string id, HttpContext context, HotelDbContext db) =>
        {
            if (await AdminApi.AuthError(context, db) is { } error)
                return error;
            if (!Kinds.Contains(kind))
                return Results.NotFound();
            context.Response.Headers.CacheControl = "private, no-store";
            object? record = id == "new" ? null : kind switch
            {
                "destinations" => await db.Destinations.FirstOrDefaultAsync(x => x.Id == id),
                "hotels" => await db.Hotels.FirstOrDefaultAsync(x => x.Id == id),
                "rooms" => await db.Rooms.FirstOrDefaultAsync(x => x.Id == id),
                "offers" => await db.Offers.FirstOrDefaultAsync(x => x.Id == id),
                _ => await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id)
            };
            if (id != "new" && record is null)
                return Results.NotFound();
            return Results.Ok(new
            {
                record,
                pickers = new
                {
                    destinations = await db.Destinations.OrderBy(x => x.Name)
                        .Select(x => new { x.Id, x.Name }).ToListAsync(),
                    hotels = await db.Hotels.OrderBy(x => x.Name)
                        .Select(x => new { x.Id, x.Name }).ToListAsync(),
                    rooms = await db.Rooms.OrderBy(x => x.Name)
                        .Select(x => new { x.Id, x.Name }).ToListAsync(),
                    offers = await db.Offers.OrderBy(x => x.Title)
                        .Select(x => new { x.Id, name = x.Title }).ToListAsync()
                }
            });
        });
    }
}
