using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

internal static class AdminDashboardRoutes
{
    internal static void MapDashboard(RouteGroupBuilder admin)
    {
        admin.MapGet("/dashboard", async (HttpContext context, HotelDbContext db) =>
        {
            if (await AdminApi.AuthError(context, db) is { } error)
                return error;
            context.Response.Headers.CacheControl = "private, no-store";
            return Results.Ok(await GetOverview(db));
        });
    }
    private static async Task<object> GetOverview(HotelDbContext db) => new
    {
        counts = await GetCounts(db),
        inquiries = await GetRecentInquiries(db),
        destinations = await db.Destinations.OrderBy(d => d.Name).ToListAsync(),
        hotels = await db.Hotels.OrderBy(h => h.Name).ToListAsync(),
        posts = await db.BlogPosts.OrderByDescending(p => p.UpdatedAt).ToListAsync(),
        rooms = await db.Rooms.OrderBy(r => r.Name).ToListAsync(),
        offers = await db.Offers.OrderBy(o => o.Title).ToListAsync(),
        media = await db.MediaAssets.OrderByDescending(m => m.CreatedAt).ToListAsync()
    };

    private static async Task<object> GetCounts(HotelDbContext db) => new
    {
        destinations = await db.Destinations.CountAsync(),
        hotels = await db.Hotels.CountAsync(),
        rooms = await db.Rooms.CountAsync(),
        offers = await db.Offers.CountAsync(),
        posts = await db.BlogPosts.CountAsync(),
        inquiries = await db.Inquiries.CountAsync()
    };

    private static async Task<object> GetRecentInquiries(HotelDbContext db) =>
        await (from inquiry in db.Inquiries
               join hotel in db.Hotels on inquiry.HotelId equals hotel.Id
               orderby inquiry.CreatedAt descending
               select new
               {
                   inquiry,
                   hotelName = hotel.Name
               })
            .Take(20).ToListAsync();
}
