using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using Hotel.Api.Admin;
using Hotel.Api.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Hotel.Api.Public;

public static class PublicApi
{
    internal const string Published = "published";
    internal static readonly (string Category, string Label)[] AmenityCategories =
    [
        ("languages", "Languages spoken"), ("internet", "Internet access"),
        ("recreation", "Things to do"), ("services", "Services and conveniences"),
        ("access", "Access and safety"), ("room", "In the room")
    ];

    public static void MapPublicApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/home", Home);
        api.MapGet("/destinations", Destinations);
        api.MapGet("/destinations/{slug}", DestinationDetail);
        api.MapGet("/hotels/{slug}", PublicHotelApi.HotelDetail);
        api.MapGet("/hotels/{slug}/offers/{offerSlug}", PublicContentApi.OfferDetail);
        api.MapGet("/search", PublicSearchApi.Search);
        api.MapGet("/posts", PublicContentApi.Posts);
        api.MapGet("/posts/{slug}", PublicContentApi.PostDetail);
        api.MapGet("/inquiry-context", PublicContentApi.InquiryContext);
        api.MapPost("/inquiries", PublicInquiryApi.SubmitInquiry);
    }

    private static async Task<IResult> Home(HotelDbContext db, CancellationToken ct)
    {
        var destinations = await db.Destinations.AsNoTracking().Where(d => d.Status == Published)
            .OrderBy(d => d.Name).Take(6).ToListAsync(ct);
        var hotels = await VisibleHotels(db).OrderByDescending(h => h.Rating).ThenBy(h => h.Id)
            .Take(6).ToListAsync(ct);
        var offers = await (from offer in db.Offers.AsNoTracking()
                            join hotel in VisibleHotels(db) on offer.HotelId equals hotel.Id
                            where offer.Status == Published
                            orderby offer.Id
                            select new
                            {
                                Offer = offer,
                                HotelSlug = hotel.Slug
                            }).Take(3).ToListAsync(ct);
        var posts = await db.BlogPosts.AsNoTracking().Where(p => p.Status == Published)
            .OrderByDescending(p => p.PublishedAt).ThenBy(p => p.Id).Take(3).ToListAsync(ct);
        return TypedResults.Ok(new
        {
            destinations,
            hotels,
            offers = offers.Select(x => new
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
            posts
        });
    }

    internal static IQueryable<Hotel.Api.Data.Hotel> VisibleHotels(HotelDbContext db) =>
        from hotel in db.Hotels.AsNoTracking()
        join destination in db.Destinations.AsNoTracking()
            on hotel.DestinationId equals destination.Id
        where hotel.Status == Published && destination.Status == Published
        select hotel;

    private static async Task<IResult> Destinations(HotelDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await db.Destinations.AsNoTracking().Where(d => d.Status == Published)
            .OrderBy(d => d.Name).ToListAsync(ct));

    private static async Task<IResult> DestinationDetail(
        string slug, HotelDbContext db, CancellationToken ct)
    {
        var destination = await db.Destinations.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Slug == slug && d.Status == Published, ct);
        if (destination is null)
            return TypedResults.NotFound();
        var hotels = await VisibleHotels(db).Where(h => h.DestinationId == destination.Id)
            .OrderByDescending(h => h.Rating).ThenBy(h => h.Id).ToListAsync(ct);
        return TypedResults.Ok(new
        {
            destination,
            hotels
        });
    }

}

internal static class PublicHotelApi
{
    private const string Published = PublicApi.Published;
    private static readonly (string Category, string Label)[] AmenityCategories =
        PublicApi.AmenityCategories;

    private static IQueryable<Hotel.Api.Data.Hotel> VisibleHotels(HotelDbContext db) =>
        PublicApi.VisibleHotels(db);

    internal static async Task<IResult> HotelDetail(
        string slug, HotelDbContext db, CancellationToken ct)
    {
        var hotel = await VisibleHotels(db).FirstOrDefaultAsync(h => h.Slug == slug, ct);
        if (hotel is null)
            return TypedResults.NotFound();
        var destination = await db.Destinations.AsNoTracking()
            .FirstAsync(d => d.Id == hotel.DestinationId, ct);
        var details = await LoadHotelDetails(db, hotel.Id, ct);
        return TypedResults.Ok(HotelResponse(hotel, destination, details));
    }

    private sealed record HotelDetails(
        List<Room> Rooms, List<Offer> Offers, List<Amenity> Amenities,
        List<RoomAmenity> RoomAmenities, List<HotelGalleryImage> Gallery,
        List<HotelHighlight> Highlights, List<HotelFact> Facts, List<HotelFaq> Faqs,
        List<HotelNearbyPlace> NearbyPlaces, List<HotelPolicy> Policies,
        List<HotelReviewScore> ReviewScores, List<HotelReview> Reviews);

    private sealed record RoomAmenity(string RoomId, string Id, string Name);

    private static async Task<HotelDetails> LoadHotelDetails(
        HotelDbContext db, string hotelId, CancellationToken ct)
    {
        var rooms = await db.Rooms.AsNoTracking()
            .Where(r => r.HotelId == hotelId && r.Status == Published)
            .OrderBy(r => r.Id).ToListAsync(ct);
        var offers = await db.Offers.AsNoTracking()
            .Where(o => o.HotelId == hotelId && o.Status == Published)
            .OrderBy(o => o.Id).ToListAsync(ct);
        var amenities = await (from link in db.HotelAmenities.AsNoTracking()
                               join amenity in db.Amenities.AsNoTracking()
                                   on link.AmenityId equals amenity.Id
                               where link.HotelId == hotelId
                               orderby amenity.Id
                               select amenity).ToListAsync(ct);
        var roomAmenities = await (from link in db.RoomAmenities.AsNoTracking()
                                   join room in db.Rooms.AsNoTracking()
                                       on link.RoomId equals room.Id
                                   join amenity in db.Amenities.AsNoTracking()
                                       on link.AmenityId equals amenity.Id
                                   where room.HotelId == hotelId && room.Status == Published
                                   orderby link.RoomId, amenity.Id
                                   select new RoomAmenity(room.Id, amenity.Id, amenity.Name))
            .ToListAsync(ct);
        var gallery = await db.HotelGalleryImages.AsNoTracking()
            .Where(g => g.HotelId == hotelId)
            .OrderBy(g => g.SortOrder).ThenBy(g => g.Id).ToListAsync(ct);
        var highlights = await db.HotelHighlights.AsNoTracking()
            .Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var facts = await db.HotelFacts.AsNoTracking().Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var faqs = await db.HotelFaqs.AsNoTracking().Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var nearby = await db.HotelNearbyPlaces.AsNoTracking()
            .Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var policies = await db.HotelPolicies.AsNoTracking().Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var scores = await db.HotelReviewScores.AsNoTracking()
            .Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Category).ToListAsync(ct);
        var reviews = await db.HotelReviews.AsNoTracking().Where(x => x.HotelId == hotelId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        return new(rooms, offers, amenities, roomAmenities, gallery,
            highlights, facts, faqs, nearby, policies, scores, reviews);
    }

    private static object HotelResponse(
        Hotel.Api.Data.Hotel hotel, Destination destination, HotelDetails details)
    {
        var roomNames = details.Rooms.ToDictionary(x => x.Id, x => x.Name);
        return new
        {
            hotel,
            destination,
            rooms = details.Rooms.Select(room => RoomResponse(room, details.RoomAmenities)),
            offers = details.Offers,
            amenities = details.Amenities.Select(a => new { a.Id, a.Name, a.Icon }),
            gallery = details.Gallery.Count > 0
                ? details.Gallery.Select(g => new GalleryItem(
                    g.Id, g.Src, g.Alt, g.Caption, g.Category, g.SortOrder, g.RoomId))
                : [new GalleryItem("hero", hotel.HeroImage, hotel.Name,
                    null, "property", 0, null)],
            details.Highlights,
            details.Facts,
            details.Faqs,
            details.NearbyPlaces,
            details.Policies,
            details.ReviewScores,
            reviews = details.Reviews.Select(review => ReviewResponse(review, roomNames)),
            amenitiesByCategory = AmenityCategories.Select(category => new
            {
                category = category.Category,
                label = category.Label,
                items = details.Amenities.Where(a => a.Category == category.Category)
                    .Select(a => new { a.Id, a.Name, a.Icon }).ToList()
            }).Where(category => category.items.Count > 0)
        };
    }

    private static object RoomResponse(Room room, List<RoomAmenity> roomAmenities) => new
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
        amenities = roomAmenities.Where(a => a.RoomId == room.Id)
    };

    private static object ReviewResponse(
        HotelReview review, Dictionary<string, string> roomNames) =>
        new
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

    private sealed record GalleryItem(string Id, string Src, string Alt, string? Caption,
        string Category, int SortOrder, string? RoomId);

}

internal static class PublicContentApi
{
    private const string Published = PublicApi.Published;

    private static IQueryable<Hotel.Api.Data.Hotel> VisibleHotels(HotelDbContext db) =>
        PublicApi.VisibleHotels(db);

    internal static async Task<IResult> OfferDetail(
        string slug, string offerSlug, HotelDbContext db, CancellationToken ct)
    {
        var hotel = await VisibleHotels(db).FirstOrDefaultAsync(h => h.Slug == slug, ct);
        if (hotel is null)
            return TypedResults.NotFound();
        var offer = await db.Offers.AsNoTracking().FirstOrDefaultAsync(o => o.HotelId == hotel.Id &&
            o.Slug == offerSlug && o.Status == Published, ct);
        if (offer is null)
            return TypedResults.NotFound();
        var destination = await db.Destinations.AsNoTracking()
            .FirstAsync(d => d.Id == hotel.DestinationId, ct);
        return TypedResults.Ok(new
        {
            offer,
            hotel,
            destination
        });
    }

    internal static async Task<IResult> Posts(HotelDbContext db, CancellationToken ct) =>
        TypedResults.Ok(await db.BlogPosts.AsNoTracking().Where(p => p.Status == Published)
            .OrderByDescending(p => p.PublishedAt).ThenBy(p => p.Id).ToListAsync(ct));

    internal static async Task<IResult> PostDetail(
        string slug, HotelDbContext db, CancellationToken ct)
    {
        var post = await db.BlogPosts.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Slug == slug && p.Status == Published, ct);
        if (post is null)
            return TypedResults.NotFound();
        var embeddedHotels = await VisibleHotels(db).ToListAsync(ct);
        return TypedResults.Ok(new
        {
            post,
            embeddedHotels
        });
    }

    internal static async Task<IResult> InquiryContext(
        HttpRequest request, HotelDbContext db, CancellationToken ct)
    {
        var hotelId = request.Query["hotel"].ToString();
        if (string.IsNullOrEmpty(hotelId))
            return TypedResults.BadRequest(new
            {
                fieldErrors = new
                {
                    hotel = new[] { "Hotel is required" }
                }
            });
        var hotel = await VisibleHotels(db).FirstOrDefaultAsync(h => h.Id == hotelId, ct);
        if (hotel is null)
            return TypedResults.NotFound();
        var roomId = request.Query["room"].ToString();
        var offerId = request.Query["offer"].ToString();
        Room? selectedRoom = null;
        Offer? selectedOffer = null;
        if (roomId.Length > 0)
        {
            selectedRoom = await db.Rooms.AsNoTracking().FirstOrDefaultAsync(r =>
                r.Id == roomId && r.HotelId == hotel.Id && r.Status == Published, ct);
            if (selectedRoom is null)
                return TypedResults.NotFound();
        }
        if (offerId.Length > 0)
        {
            selectedOffer = await db.Offers.AsNoTracking().FirstOrDefaultAsync(o =>
                o.Id == offerId && o.HotelId == hotel.Id && o.Status == Published, ct);
            if (selectedOffer is null)
                return TypedResults.NotFound();
        }
        return TypedResults.Ok(InquiryContextResponse(hotel, selectedRoom, selectedOffer));
    }

    private static object InquiryContextResponse(
        Hotel.Api.Data.Hotel hotel, Room? selectedRoom, Offer? selectedOffer) => new
        {
            hotel.Id,
            hotel.DestinationId,
            hotel.Name,
            hotel.Slug,
            hotel.PropertyType,
            hotel.Address,
            hotel.Summary,
            hotel.Description,
            hotel.HeroImage,
            hotel.Rating,
            hotel.StarRating,
            hotel.ReviewCount,
            hotel.PriceFrom,
            hotel.Currency,
            hotel.Latitude,
            hotel.Longitude,
            hotel.SeoTitle,
            hotel.SeoDescription,
            hotel.Status,
            hotel.PublishedAt,
            hotel.CreatedAt,
            hotel.UpdatedAt,
            selectedRoom,
            selectedOffer
        };

}

internal static class PublicSearchApi
{

    internal static async Task<IResult> Search(
        HttpRequest request, HotelDbContext db, CancellationToken ct)
    {
        var search = await new CatalogPageService(db).Search(request.Query, ct);
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
                                    }).ToListAsync(ct);
        return TypedResults.Ok(new
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
        });
    }
}

internal static class PublicInquiryApi
{
    private const string Published = PublicApi.Published;

    private static IQueryable<Hotel.Api.Data.Hotel> VisibleHotels(HotelDbContext db) =>
        PublicApi.VisibleHotels(db);

    internal static async Task<IResult> SubmitInquiry(
        HttpRequest request, HotelDbContext db, CancellationToken ct)
    {
        if (!AdminApi.RequireCsrf(request.HttpContext))
            return TypedResults.Json(new
            {
                error = "Invalid CSRF token"
            },
                statusCode: StatusCodes.Status403Forbidden);
        JsonDocument payload;
        try
        {
            payload = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return InvalidBody();
        }
        using (payload)
        {
            if (payload.RootElement.ValueKind != JsonValueKind.Object)
                return InvalidBody();
            var errors = new Dictionary<string, string[]>();
            var input = ParseInput(payload.RootElement, errors);
            if (errors.Count != 0)
                return TypedResults.BadRequest(new
                {
                    fieldErrors = errors
                });
            await ValidateAvailability(input, db, errors, ct);
            if (errors.Count != 0)
                return TypedResults.BadRequest(new
                {
                    fieldErrors = errors
                });
            var id = await SaveInquiry(input, db, ct);
            return TypedResults.Ok(new
            {
                id,
                reference = id[..8].ToUpperInvariant(),
                message = "Inquiry received. This is not a reservation; no payment has been taken."
            });
        }
    }

    private static async Task<string> SaveInquiry(
        InquiryInput input, HotelDbContext db, CancellationToken ct)
    {
        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;
        db.Inquiries.Add(new Inquiry
        {
            Id = id,
            HotelId = input.HotelId!,
            RoomId = input.RoomId,
            OfferId = input.OfferId,
            CheckIn = input.CheckIn!,
            CheckOut = input.CheckOut!,
            Adults = input.Adults,
            Children = input.Children,
            Name = input.Name!,
            Email = input.Email!,
            Phone = input.Phone,
            Message = input.Message,
            Status = "new",
            CreatedAt = now,
            UpdatedAt = now
        });
        await db.SaveChangesAsync(ct);
        return id;
    }

    private static IResult InvalidBody() =>
        TypedResults.BadRequest(new
        {
            fieldErrors = new
            {
                body = new[] { "Valid JSON object is required" }
            }
        });

    private sealed record InquiryInput(
        string? HotelId, string? RoomId, string? OfferId, string? CheckIn, string? CheckOut,
        int Adults, int Children, string? Name, string? Email, string? Phone, string? Message);

    private static InquiryInput ParseInput(
        JsonElement input, Dictionary<string, string[]> errors)
    {
        var hotelId = Field(input, errors, "hotelId", 1, 160);
        var roomId = Field(input, errors, "roomId", 0, 160, false);
        var offerId = Field(input, errors, "offerId", 0, 160, false);
        var checkIn = Date(input, errors, "checkIn");
        var checkOut = Date(input, errors, "checkOut");
        var adults = Party(input, errors, "adults", 1, 12);
        var children = Party(input, errors, "children", 0, 8, 0);
        var name = Field(input, errors, "name", 2, 100);
        var email = Field(input, errors, "email", 1, 160);
        var phone = Field(input, errors, "phone", 0, 40, false);
        var message = Field(input, errors, "message", 0, 1200, false);
        var website = Field(input, errors, "website", 0, 0, false);
        if (website is not null)
            errors["website"] = ["Must be empty"];
        if (email is not null && (!MailAddress.TryCreate(email, out var parsed) ||
            parsed.Address != email || !parsed.Host.Contains('.')))
            errors["email"] = ["Enter a valid email address"];
        if (checkIn is not null && checkOut is not null &&
            string.CompareOrdinal(checkOut, checkIn) <= 0)
            errors["checkOut"] = ["Check-out must be after check-in"];
        return new(hotelId, roomId, offerId, checkIn, checkOut,
            adults, children, name, email, phone, message);
    }

    private static string? Field(
        JsonElement input, Dictionary<string, string[]> errors,
        string key, int min, int max, bool required = true)
    {
        if (!input.TryGetProperty(key, out var item) || item.ValueKind == JsonValueKind.Null)
        {
            if (required)
                errors[key] = ["Required"];
            return null;
        }
        if (item.ValueKind != JsonValueKind.String)
        {
            errors[key] = ["Must be a string"];
            return null;
        }
        var value = item.GetString()!.Trim();
        if (value.Length < min || value.Length > max)
            errors[key] = [$"Must be between {min} and {max} characters"];
        return value.Length == 0 && !required ? null : value;
    }

    private static int Party(
        JsonElement input, Dictionary<string, string[]> errors,
        string key, int min, int max, int? defaultValue = null)
    {
        if (!input.TryGetProperty(key, out var item) || item.ValueKind == JsonValueKind.Null)
        {
            if (defaultValue is null)
                errors[key] = ["Required"];
            return defaultValue ?? 0;
        }
        var n = 0;
        var valid = item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out n);
        if (!valid && item.ValueKind == JsonValueKind.String)
            valid = int.TryParse(item.GetString(), NumberStyles.Integer,
                CultureInfo.InvariantCulture, out n);
        if (!valid || n < min || n > max)
            errors[key] = [$"Must be an integer between {min} and {max}"];
        return valid ? n : 0;
    }

    private static string? Date(
        JsonElement input, Dictionary<string, string[]> errors, string key)
    {
        var date = Field(input, errors, key, 10, 10);
        if (date is not null && !DateOnly.TryParseExact(date, "yyyy-MM-dd",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            errors[key] = ["Must be a valid YYYY-MM-DD date"];
        return date;
    }

    private static async Task ValidateAvailability(
        InquiryInput input, HotelDbContext db, Dictionary<string, string[]> errors,
        CancellationToken ct)
    {
        if (!await VisibleHotels(db).AnyAsync(h => h.Id == input.HotelId, ct))
            errors["hotelId"] = ["Hotel is not available for inquiries"];
        if (input.RoomId is not null && !await db.Rooms.AsNoTracking().AnyAsync(r =>
            r.Id == input.RoomId && r.HotelId == input.HotelId && r.Status == Published, ct))
            errors["roomId"] = ["Room is not available at this hotel"];
        if (input.OfferId is not null && !await db.Offers.AsNoTracking().AnyAsync(o =>
            o.Id == input.OfferId && o.HotelId == input.HotelId && o.Status == Published, ct))
            errors["offerId"] = ["Offer is not available at this hotel"];
    }
}
