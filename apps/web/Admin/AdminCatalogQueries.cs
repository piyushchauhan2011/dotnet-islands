using Hotel.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Admin;

public sealed class AdminCatalogQueries(HotelDbContext db)
{
    public static bool Supports(string kind) =>
        kind is "destinations" or "hotels" or "rooms" or "offers" or "posts";

    public async Task<object> ListAsync(string kind) => kind switch
    {
        "destinations" => await db.Destinations.OrderBy(x => x.Name).ToListAsync(),
        "hotels" => await db.Hotels.OrderBy(x => x.Name).ToListAsync(),
        "rooms" => await db.Rooms.OrderBy(x => x.Name).ToListAsync(),
        "offers" => await db.Offers.OrderBy(x => x.Title).ToListAsync(),
        _ => await db.BlogPosts.OrderByDescending(x => x.UpdatedAt).ToListAsync()
    };

    public async Task<object?> ItemAsync(string kind, string id)
    {
        object? record = id == "new" ? null : kind switch
        {
            "destinations" => await db.Destinations.FirstOrDefaultAsync(x => x.Id == id),
            "hotels" => await db.Hotels.FirstOrDefaultAsync(x => x.Id == id),
            "rooms" => await db.Rooms.FirstOrDefaultAsync(x => x.Id == id),
            "offers" => await db.Offers.FirstOrDefaultAsync(x => x.Id == id),
            _ => await db.BlogPosts.FirstOrDefaultAsync(x => x.Id == id)
        };
        if (id != "new" && record is null)
            return null;
        return new
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
        };
    }
}
