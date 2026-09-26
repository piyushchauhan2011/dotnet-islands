using CatalogHotel = global::Hotel.Web.Data.Hotel;
using System.Globalization;
using Hotel.Web.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Public;

// Razor pages query the catalog directly; no HTTP loopback and no unpublished relations.
public sealed class CatalogPageService(HotelDbContext db)
{
    public IQueryable<CatalogHotel> VisibleHotels =>
        from hotel in db.Hotels.AsNoTracking()
        join destination in db.Destinations.AsNoTracking()
            on hotel.DestinationId equals destination.Id
        where hotel.Status == "published" && destination.Status == "published"
        select hotel;

    public async Task<IReadOnlyList<Destination>> Destinations(CancellationToken ct) =>
        await db.Destinations.AsNoTracking().Where(x => x.Status == "published")
            .OrderBy(x => x.Name).ToListAsync(ct);

    public async Task<IReadOnlyList<BlogPost>> Posts(CancellationToken ct) =>
        await db.BlogPosts.AsNoTracking().Where(x => x.Status == "published")
            .OrderByDescending(x => x.PublishedAt).ThenBy(x => x.Id).ToListAsync(ct);

    public async Task<HomeCatalog> Home(CancellationToken ct)
    {
        var destinations = await db.Destinations.AsNoTracking().Where(x => x.Status == "published")
            .OrderBy(x => x.Name).Take(6).ToListAsync(ct);
        var hotels = await VisibleHotels.OrderByDescending(x => x.Rating).ThenBy(x => x.Id)
            .Take(6).ToListAsync(ct);
        var offers = await (from offer in db.Offers.AsNoTracking()
                            join hotel in VisibleHotels on offer.HotelId equals hotel.Id
                            where offer.Status == "published"
                            orderby offer.Id
                            select new HomeOffer(offer, hotel.Slug)).Take(3).ToListAsync(ct);
        var posts = await db.BlogPosts.AsNoTracking().Where(x => x.Status == "published")
            .OrderByDescending(x => x.PublishedAt).ThenBy(x => x.Id).Take(3).ToListAsync(ct);
        return new(destinations, hotels, offers, posts);
    }

    public async Task<DestinationCatalog?> Destination(string slug, CancellationToken ct)
    {
        var destination = await db.Destinations.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Slug == slug && x.Status == "published", ct);
        if (destination is null)
            return null;
        var hotels = await VisibleHotels.Where(x => x.DestinationId == destination.Id)
            .OrderByDescending(x => x.Rating).ThenBy(x => x.Id).ToListAsync(ct);
        return new(destination, hotels);
    }

    public Task<HotelCatalog?> Hotel(string slug, CancellationToken ct) =>
        new HotelPageCatalogService(db).Get(slug, ct);

    public async Task<OfferCatalog?> Offer(string slug, string offerSlug, CancellationToken ct)
    {
        var hotel = await VisibleHotels.FirstOrDefaultAsync(x => x.Slug == slug, ct);
        if (hotel is null)
            return null;
        var offer = await db.Offers.AsNoTracking().FirstOrDefaultAsync(x =>
            x.HotelId == hotel.Id && x.Slug == offerSlug && x.Status == "published", ct);
        if (offer is null)
            return null;
        var destination = await db.Destinations.AsNoTracking()
            .FirstAsync(x => x.Id == hotel.DestinationId, ct);
        return new(offer, hotel, destination);
    }

    public async Task<PostCatalog?> Post(string slug, CancellationToken ct)
    {
        var post = await db.BlogPosts.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Slug == slug && x.Status == "published", ct);
        if (post is null)
            return null;
        return new(post, await VisibleHotels.ToDictionaryAsync(
            x => x.Id, StringComparer.Ordinal, ct));
    }

    public async Task<InquiryCatalog?> Inquiry(
        string id, string? roomId, string? offerId, CancellationToken ct)
    {
        var hotel = await VisibleHotels.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (hotel is null)
            return null;
        Room? room = null;
        Offer? offer = null;
        if (!string.IsNullOrEmpty(roomId))
        {
            room = await db.Rooms.AsNoTracking().FirstOrDefaultAsync(x =>
                x.Id == roomId && x.HotelId == id && x.Status == "published", ct);
            if (room is null)
                return null;
        }
        if (!string.IsNullOrEmpty(offerId))
        {
            offer = await db.Offers.AsNoTracking().FirstOrDefaultAsync(x =>
                x.Id == offerId && x.HotelId == id && x.Status == "published", ct);
            if (offer is null)
                return null;
        }
        return new(hotel, room, offer);
    }

    public async Task<SearchCatalog> Search(IQueryCollection q, CancellationToken ct)
    {
        var filters = ParseFilters(q);
        var hotels = from hotel in VisibleHotels
                     join place in db.Destinations.AsNoTracking()
                         on hotel.DestinationId equals place.Id
                     select new
                     {
                         Hotel = hotel,
                         Destination = place
                     };
        if (!string.IsNullOrEmpty(filters.Destination))
            hotels = hotels.Where(x => x.Destination.Slug == filters.Destination);
        if (!string.IsNullOrEmpty(filters.Query))
        {
            var pattern = "%" + filters.Query.Replace("\\", "\\\\")
                .Replace("%", "\\%").Replace("_", "\\_") + "%";
            hotels = hotels.Where(x => EF.Functions.ILike(x.Hotel.Name, pattern, "\\") ||
                EF.Functions.ILike(x.Hotel.Summary, pattern, "\\") ||
                EF.Functions.ILike(x.Destination.Name, pattern, "\\"));
        }
        if (filters.MinPrice is not null)
            hotels = hotels.Where(x => x.Hotel.PriceFrom >= filters.MinPrice);
        if (filters.MaxPrice is not null)
            hotels = hotels.Where(x => x.Hotel.PriceFrom <= filters.MaxPrice);
        if (filters.Rating is not null)
            hotels = hotels.Where(x => x.Hotel.Rating >= filters.Rating);
        if (filters.Offers)
            hotels = hotels.Where(x => db.Offers.Any(o =>
                o.HotelId == x.Hotel.Id && o.Status == "published"));
        foreach (var id in filters.Amenities)
            hotels = hotels.Where(x => db.HotelAmenities.Any(a =>
                a.HotelId == x.Hotel.Id && a.AmenityId == id));
        var total = await hotels.CountAsync(ct);
        var ordered = filters.Sort switch
        {
            "price-asc" => hotels.OrderBy(x => x.Hotel.PriceFrom).ThenBy(x => x.Hotel.Id),
            "price-desc" => hotels.OrderByDescending(x => x.Hotel.PriceFrom)
                .ThenBy(x => x.Hotel.Id),
            "rating" => hotels.OrderByDescending(x => x.Hotel.Rating).ThenBy(x => x.Hotel.Id),
            _ => hotels.OrderBy(x => x.Hotel.Id)
        };
        var offset = (long)(filters.Page - 1) * 9;
        List<SearchResult> results = offset >= total ? [] :
            (await ordered.Skip((int)offset).Take(9).ToListAsync(ct))
                .Select(x => new SearchResult(x.Hotel, x.Destination)).ToList();
        var amenities = await db.Amenities.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
        return new(results, amenities, filters, total,
            Math.Max(1, (int)Math.Ceiling(total / 9.0)));
    }

    private static SearchFilters ParseFilters(IQueryCollection q)
    {
        static string? Bounded(IQueryCollection q, string key, int max)
        {
            var value = q.TryGetValue(key, out var found) ? found.ToString().Trim() : null;
            return value?.Length <= max ? value : null;
        }
        static double? Number(
            IQueryCollection q, string key, double min, double max = double.MaxValue) =>
            double.TryParse(q[key], NumberStyles.Float, CultureInfo.InvariantCulture, out var n) &&
            double.IsFinite(n) && n >= min && n <= max ? n : null;
        static int Integer(IQueryCollection q, string key, int fallback, int min, int max) =>
            int.TryParse(q[key], NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) &&
            n >= min && n <= max ? n : fallback;
        static string? Date(IQueryCollection q, string key) =>
            DateOnly.TryParseExact(q[key], "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date)
                ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
        var amenities = q["amenities"].SelectMany(x => x?.Split(',') ?? [])
            .Where(x => !string.IsNullOrEmpty(x)).Distinct(StringComparer.Ordinal).ToArray();
        var sort = q["sort"].ToString();
        if (sort is not ("price-asc" or "price-desc" or "rating"))
            sort = "relevance";
        return new SearchFilters(
            Bounded(q, "destination", 80), Bounded(q, "query", 100),
            Date(q, "checkIn"), Date(q, "checkOut"), Integer(q, "adults", 2, 1, 12),
            Integer(q, "children", 0, 0, 8), Number(q, "minPrice", 0),
            Number(q, "maxPrice", 0), Number(q, "rating", 0, 5),
            amenities, string.Equals(q["offers"], "true", StringComparison.OrdinalIgnoreCase),
            sort, Integer(q, "page", 1, 1, int.MaxValue));
    }
}

public sealed record HomeCatalog(
    IReadOnlyList<Destination> Destinations, IReadOnlyList<CatalogHotel> Hotels,
    IReadOnlyList<HomeOffer> Offers, IReadOnlyList<BlogPost> Posts);
public sealed record HomeOffer(Offer Offer, string HotelSlug);
public sealed record DestinationCatalog(
    Destination Destination, IReadOnlyList<CatalogHotel> Hotels);
public sealed record GalleryPhoto(
    string Id, string Src, string Alt, string? Caption, string Category, string? RoomId);
public sealed record RoomAmenityView(string RoomId, string Id, string Name);
public sealed record HotelCatalog(
    CatalogHotel Hotel, Destination Destination,
    IReadOnlyList<Room> Rooms, IReadOnlyList<Offer> Offers,
    IReadOnlyList<Amenity> Amenities, IReadOnlyList<RoomAmenityView> RoomAmenities,
    IReadOnlyList<GalleryPhoto> Gallery, IReadOnlyList<HotelHighlight> Highlights,
    IReadOnlyList<HotelFact> Facts, IReadOnlyList<HotelFaq> Faqs,
    IReadOnlyList<HotelNearbyPlace> NearbyPlaces, IReadOnlyList<HotelPolicy> Policies,
    IReadOnlyList<HotelReviewScore> ReviewScores, IReadOnlyList<HotelReview> Reviews);
public sealed record OfferCatalog(Offer Offer, CatalogHotel Hotel, Destination Destination);
public sealed record PostCatalog(
    BlogPost Post, IReadOnlyDictionary<string, CatalogHotel> EmbeddedHotels);
public sealed record InquiryCatalog(CatalogHotel Hotel, Room? Room, Offer? Offer);
public sealed record SearchResult(CatalogHotel Hotel, Destination Destination);
public sealed record SearchFilters(
    string? Destination, string? Query, string? CheckIn, string? CheckOut, int Adults, int Children,
    double? MinPrice, double? MaxPrice, double? Rating, string[] Amenities,
    bool Offers, string Sort, int Page);
public sealed record SearchCatalog(
    IReadOnlyList<SearchResult> Results, IReadOnlyList<Amenity> Amenities, SearchFilters Filters,
    int Total, int Pages);
