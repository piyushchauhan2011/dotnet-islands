using Hotel.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Admin;

public sealed class AdminDashboardQueries(HotelDbContext db)
{
    public async Task<object> GetOverviewAsync(CancellationToken cancellationToken = default) => new
    {
        counts = await GetCountsAsync(cancellationToken),
        inquiries = await GetRecentInquiriesAsync(cancellationToken),
        destinations = await db.Destinations.OrderBy(d => d.Name).ToListAsync(cancellationToken),
        hotels = await db.Hotels.OrderBy(h => h.Name).ToListAsync(cancellationToken),
        posts = await db.BlogPosts.OrderByDescending(p => p.UpdatedAt)
            .ToListAsync(cancellationToken),
        rooms = await db.Rooms.OrderBy(r => r.Name).ToListAsync(cancellationToken),
        offers = await db.Offers.OrderBy(o => o.Title).ToListAsync(cancellationToken),
        media = await db.MediaAssets.OrderByDescending(m => m.CreatedAt)
            .ToListAsync(cancellationToken)
    };

    private async Task<object> GetCountsAsync(CancellationToken cancellationToken) => new
    {
        destinations = await db.Destinations.CountAsync(cancellationToken),
        hotels = await db.Hotels.CountAsync(cancellationToken),
        rooms = await db.Rooms.CountAsync(cancellationToken),
        offers = await db.Offers.CountAsync(cancellationToken),
        posts = await db.BlogPosts.CountAsync(cancellationToken),
        inquiries = await db.Inquiries.CountAsync(cancellationToken)
    };

    private async Task<object> GetRecentInquiriesAsync(CancellationToken cancellationToken) =>
        await (from inquiry in db.Inquiries
               join hotel in db.Hotels on inquiry.HotelId equals hotel.Id
               orderby inquiry.CreatedAt descending
               select new
               {
                   inquiry,
                   hotelName = hotel.Name
               })
            .Take(20).ToListAsync(cancellationToken);
}
