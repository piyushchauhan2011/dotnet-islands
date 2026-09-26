using Hotel.Web.Data;
using Microsoft.EntityFrameworkCore;
using CatalogHotel = global::Hotel.Web.Data.Hotel;

namespace Hotel.Web.Public;

internal sealed class HotelPageCatalogService(HotelDbContext db)
{
    public async Task<HotelCatalog?> Get(string slug, CancellationToken ct)
    {
        var hotel = await new CatalogPageService(db).VisibleHotels
            .FirstOrDefaultAsync(x => x.Slug == slug, ct);
        if (hotel is null)
            return null;
        var destination = await db.Destinations.AsNoTracking()
            .FirstAsync(x => x.Id == hotel.DestinationId, ct);
        var rooms = await db.Rooms.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id && x.Status == "published")
            .OrderBy(x => x.Id).ToListAsync(ct);
        var offers = await db.Offers.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id && x.Status == "published")
            .OrderBy(x => x.Id).ToListAsync(ct);
        var amenities = await (from link in db.HotelAmenities.AsNoTracking()
                               join amenity in db.Amenities.AsNoTracking()
                                   on link.AmenityId equals amenity.Id
                               where link.HotelId == hotel.Id
                               orderby amenity.Id
                               select amenity).ToListAsync(ct);
        var roomAmenities = await (from link in db.RoomAmenities.AsNoTracking()
                                   join room in db.Rooms.AsNoTracking()
                                       on link.RoomId equals room.Id
                                   join amenity in db.Amenities.AsNoTracking()
                                       on link.AmenityId equals amenity.Id
                                   where room.HotelId == hotel.Id && room.Status == "published"
                                   orderby link.RoomId, amenity.Id
                                   select new RoomAmenityView(room.Id, amenity.Id, amenity.Name))
            .ToListAsync(ct);
        var gallery = await db.HotelGalleryImages.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var images = Gallery(hotel, rooms, gallery);
        return await LoadDetails(hotel, destination, rooms, offers, amenities, roomAmenities,
            images, ct);
    }

    private async Task<HotelCatalog> LoadDetails(
        CatalogHotel hotel, Destination destination, List<Room> rooms, List<Offer> offers,
        List<Amenity> amenities, List<RoomAmenityView> roomAmenities, List<GalleryPhoto> images,
        CancellationToken ct)
    {
        var highlights = await db.HotelHighlights.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var facts = await db.HotelFacts.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var faqs = await db.HotelFaqs.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var nearby = await db.HotelNearbyPlaces.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var policies = await db.HotelPolicies.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var scores = await db.HotelReviewScores.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Category).ToListAsync(ct);
        var reviews = await db.HotelReviews.AsNoTracking()
            .Where(x => x.HotelId == hotel.Id)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        return new(hotel, destination, rooms, offers, amenities, roomAmenities, images,
            highlights, facts, faqs, nearby, policies, scores, reviews);
    }

    private static List<GalleryPhoto> Gallery(
        CatalogHotel hotel, List<Room> rooms, List<HotelGalleryImage> gallery)
    {
        var images = gallery.Select(x =>
            new GalleryPhoto(x.Id, x.Src, x.Alt, x.Caption, x.Category, x.RoomId)).ToList();
        if (images.Count == 0)
            images.Add(new("hero", hotel.HeroImage, hotel.Name, hotel.Name, "property", null));
        foreach (var room in rooms.Where(x => !images.Any(image => image.RoomId == x.Id)))
            images.Add(new("room-" + room.Id, room.Image, room.Name + " at " + hotel.Name,
                room.Name, "rooms", room.Id));
        return images;
    }
}
