using Hotel.Web.Data;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Web.Public;

// Catalog page models serve Razor too; these projections keep the public JSON contract separate.
internal static class PublicApiProjection
{
    private static readonly (string Category, string Label)[] AmenityCategories =
    [
        ("languages", "Languages spoken"), ("internet", "Internet access"),
        ("recreation", "Things to do"), ("services", "Services and conveniences"),
        ("access", "Access and safety"), ("room", "In the room")
    ];

    internal static object Home(HomeCatalog catalog) => new
    {
        catalog.Destinations,
        catalog.Hotels,
        offers = catalog.Offers.Select(x => new
        {
            x.Offer.Id,
            x.Offer.HotelId,
            x.Offer.Title,
            x.Offer.Slug,
            x.Offer.Summary,
            x.Offer.Image,
            x.Offer.DiscountPercent,
            x.Offer.ValidFrom,
            x.Offer.ValidTo,
            x.Offer.Terms,
            x.Offer.Status,
            x.Offer.CreatedAt,
            x.Offer.UpdatedAt,
            x.HotelSlug
        }),
        catalog.Posts
    };

    internal static object Destination(DestinationCatalog catalog) => new
    {
        catalog.Destination,
        catalog.Hotels
    };

    internal static object Offer(OfferCatalog catalog) => new
    {
        catalog.Offer,
        catalog.Hotel,
        catalog.Destination
    };

    internal static object Post(PostCatalog catalog) => new
    {
        catalog.Post,
        embeddedHotels = catalog.EmbeddedHotels.Values
    };

    internal static async Task<object> Hotel(
        HotelCatalog catalog, HotelDbContext db, CancellationToken ct)
    {
        // Razor's gallery adds room images. The JSON API exposes only stored images,
        // or one hero image when none are stored, retaining each stored sortOrder.
        var gallery = await db.HotelGalleryImages.AsNoTracking()
            .Where(x => x.HotelId == catalog.Hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id)
            .Select(x => new GalleryItem(x.Id, x.Src, x.Alt, x.Caption,
                x.Category, x.SortOrder, x.RoomId)).ToListAsync(ct);
        if (gallery.Count == 0)
            gallery.Add(new GalleryItem("hero", catalog.Hotel.HeroImage,
                catalog.Hotel.Name, null, "property", 0, null));
        return HotelResponse(catalog, gallery);
    }

    private static object HotelResponse(HotelCatalog catalog, List<GalleryItem> gallery)
    {
        var roomNames = catalog.Rooms.ToDictionary(x => x.Id, x => x.Name, StringComparer.Ordinal);
        return new
        {
            catalog.Hotel,
            catalog.Destination,
            rooms = catalog.Rooms.Select(room => Room(room, catalog.RoomAmenities)),
            catalog.Offers,
            amenities = catalog.Amenities.Select(x => new { x.Id, x.Name, x.Icon }),
            gallery,
            catalog.Highlights,
            catalog.Facts,
            catalog.Faqs,
            catalog.NearbyPlaces,
            catalog.Policies,
            catalog.ReviewScores,
            reviews = catalog.Reviews.Select(x => Review(x, roomNames)),
            amenitiesByCategory = AmenityCategories.Select(category => new
            {
                category = category.Category,
                label = category.Label,
                items = catalog.Amenities.Where(x => x.Category == category.Category)
                    .Select(x => new { x.Id, x.Name, x.Icon }).ToList()
            }).Where(category => category.items.Count > 0)
        };
    }

    private static object Room(Room room, IReadOnlyList<RoomAmenityView> roomAmenities) => new
    {
        room.Id,
        room.HotelId,
        room.Name,
        room.Slug,
        room.Summary,
        room.Image,
        room.PriceFrom,
        room.MaxGuests,
        room.SizeSqm,
        room.Bed,
        room.Status,
        room.CreatedAt,
        room.UpdatedAt,
        amenities = roomAmenities.Where(x => x.RoomId == room.Id)
    };

    private static object Review(HotelReview review, Dictionary<string, string> roomNames) => new
    {
        review.Id,
        review.HotelId,
        review.RoomId,
        review.GuestName,
        review.GuestCountry,
        review.TravelerType,
        review.Rating,
        review.Title,
        review.Body,
        review.StayedAt,
        review.ReviewedAt,
        review.Nights,
        review.Response,
        review.SortOrder,
        roomName = review.RoomId is not null &&
            roomNames.TryGetValue(review.RoomId, out var name) ? name : null
    };

    internal static async Task<object> Search(
        SearchCatalog search, HotelDbContext db, CancellationToken ct)
    {
        var selectedIds = search.Results.Select(x => x.Hotel.Id).ToArray();
        var hotelAmenities = await (from link in db.HotelAmenities.AsNoTracking()
                                    join amenity in db.Amenities.AsNoTracking()
                                        on link.AmenityId equals amenity.Id
                                    where selectedIds.Contains(link.HotelId)
                                    select new
                                    {
                                        link.HotelId,
                                        amenity.Id,
                                        amenity.Name
                                    })
            .ToListAsync(ct);
        return new
        {
            results = search.Results.Select(x => new
            {
                x.Hotel.Id,
                x.Hotel.DestinationId,
                x.Hotel.Name,
                x.Hotel.Slug,
                x.Hotel.PropertyType,
                x.Hotel.Address,
                x.Hotel.Summary,
                x.Hotel.Description,
                x.Hotel.HeroImage,
                x.Hotel.Rating,
                x.Hotel.StarRating,
                x.Hotel.ReviewCount,
                x.Hotel.PriceFrom,
                x.Hotel.Currency,
                x.Hotel.Latitude,
                x.Hotel.Longitude,
                x.Hotel.SeoTitle,
                x.Hotel.SeoDescription,
                x.Hotel.Status,
                x.Hotel.PublishedAt,
                x.Hotel.CreatedAt,
                x.Hotel.UpdatedAt,
                destination = x.Destination,
                amenities = hotelAmenities.Where(a => a.HotelId == x.Hotel.Id)
            }),
            search.Total,
            search.Filters.Page,
            search.Pages,
            search.Filters,
            search.Amenities
        };
    }

    private sealed record GalleryItem(string Id, string Src, string Alt, string? Caption,
        string Category, int SortOrder, string? RoomId);
}
