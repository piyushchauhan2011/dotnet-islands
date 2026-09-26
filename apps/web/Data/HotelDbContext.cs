using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Hotel.Web.Data;

public sealed class HotelDbContext(DbContextOptions<HotelDbContext> options) : DbContext(options)
{
    public DbSet<Destination> Destinations => Set<Destination>();
    public DbSet<Hotel> Hotels => Set<Hotel>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<Amenity> Amenities => Set<Amenity>();
    public DbSet<HotelAmenity> HotelAmenities => Set<HotelAmenity>();
    public DbSet<RoomAmenity> RoomAmenities => Set<RoomAmenity>();
    public DbSet<HotelGalleryImage> HotelGalleryImages => Set<HotelGalleryImage>();
    public DbSet<HotelHighlight> HotelHighlights => Set<HotelHighlight>();
    public DbSet<HotelFact> HotelFacts => Set<HotelFact>();
    public DbSet<HotelFaq> HotelFaqs => Set<HotelFaq>();
    public DbSet<HotelNearbyPlace> HotelNearbyPlaces => Set<HotelNearbyPlace>();
    public DbSet<HotelPolicy> HotelPolicies => Set<HotelPolicy>();
    public DbSet<HotelReviewScore> HotelReviewScores => Set<HotelReviewScore>();
    public DbSet<HotelReview> HotelReviews => Set<HotelReview>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<BlogPost> BlogPosts => Set<BlogPost>();
    public DbSet<Inquiry> Inquiries => Set<Inquiry>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<PageSnapshot> PageSnapshots => Set<PageSnapshot>();
    public DbSet<SnapshotJob> SnapshotJobs => Set<SnapshotJob>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        CatalogMappings.Configure(model);
        HotelDetailMappings.Configure(model);
        OperationalMappings.Configure(model);
        ConfigureColumns(model);
    }

    private static void ConfigureColumns(ModelBuilder model)
    {
        var timestamps = new ValueConverter<DateTime, DateTime>(
            value => DateTime.SpecifyKind(value, DateTimeKind.Unspecified),
            value => DateTime.SpecifyKind(value, DateTimeKind.Utc));

        foreach (var entity in model.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
                if (property.Name is "Id" or "Path")
                    property.ValueGenerated = ValueGenerated.Never;
                if (property.ClrType == typeof(DateTime))
                {
                    property.SetColumnType("timestamp without time zone");
                    property.SetValueConverter(timestamps);
                    if (property.Name is "CreatedAt" or "UpdatedAt")
                        property.SetDefaultValueSql("now()");
                }
                else if (property.ClrType == typeof(DateTime?))
                {
                    property.SetColumnType("timestamp without time zone");
                    property.SetValueConverter(timestamps);
                }
            }
        }
    }

    private static string ToSnakeCase(string value)
    {
        var result = new System.Text.StringBuilder(value.Length + 4);
        foreach (char character in value)
        {
            if (char.IsUpper(character) && result.Length > 0)
                result.Append('_');
            result.Append(char.ToLowerInvariant(character));
        }
        return result.ToString();
    }
}

internal static class CatalogMappings
{
    internal static void Configure(ModelBuilder model)
    {
        ConfigureDestinations(model);
        ConfigureHotels(model);
        ConfigureRoomsAndOffers(model);
        ConfigureAmenities(model);
    }

    private static void ConfigureDestinations(ModelBuilder model) => model.Entity<Destination>(e =>
    {
        e.ToTable("destinations");
        e.HasKey(x => x.Id);
        e.Property(x => x.Eyebrow).HasDefaultValue("Destination");
        e.Property(x => x.Status).HasDefaultValue("draft");
        e.Property(x => x.Content).HasColumnType("jsonb");
        e.HasIndex(x => x.Slug, "destinations_slug_idx").IsUnique();
    });

    private static void ConfigureHotels(ModelBuilder model) => model.Entity<Hotel>(e =>
    {
        e.ToTable("hotels");
        e.HasKey(x => x.Id);
        e.Property(x => x.PropertyType).HasDefaultValue("Boutique hotel");
        e.Property(x => x.ReviewCount).HasDefaultValue(0);
        e.Property(x => x.Currency).HasDefaultValue("USD");
        e.Property(x => x.Status).HasDefaultValue("draft");
        e.HasOne<Destination>().WithMany().HasForeignKey(x => x.DestinationId)
            .OnDelete(DeleteBehavior.ClientNoAction)
            .HasConstraintName("hotels_destination_id_destinations_id_fk");
        e.HasIndex(x => x.Slug, "hotels_slug_idx").IsUnique();
        e.HasIndex(x => x.DestinationId, "hotels_destination_idx");
        e.HasIndex(x => new { x.Status, x.PriceFrom, x.Rating }, "hotels_search_idx");
    });

    private static void ConfigureRoomsAndOffers(ModelBuilder model)
    {
        model.Entity<Room>(e =>
        {
            e.ToTable("rooms");
            e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasDefaultValue("draft");
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade).HasConstraintName("rooms_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.Slug }, "rooms_hotel_slug_idx").IsUnique();
        });
        model.Entity<Offer>(e =>
        {
            e.ToTable("offers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Status).HasDefaultValue("draft");
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade).HasConstraintName("offers_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.Slug }, "offers_hotel_slug_idx").IsUnique();
        });
    }

    private static void ConfigureAmenities(ModelBuilder model)
    {
        model.Entity<Amenity>(e =>
        {
            e.ToTable("amenities");
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => x.Name).HasName("amenities_name_unique");
            e.Property(x => x.Icon).HasDefaultValue("sparkles");
            e.Property(x => x.AppliesTo).HasDefaultValue("both");
            e.Property(x => x.Category).HasDefaultValue("services");
        });
        model.Entity<HotelAmenity>(e =>
        {
            e.ToTable("hotel_amenities");
            e.HasKey(x => new { x.HotelId, x.AmenityId })
                .HasName("hotel_amenities_hotel_id_amenity_id_pk");
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_amenities_hotel_id_hotels_id_fk");
            e.HasOne<Amenity>().WithMany().HasForeignKey(x => x.AmenityId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_amenities_amenity_id_amenities_id_fk");
        });
        model.Entity<RoomAmenity>(e =>
        {
            e.ToTable("room_amenities");
            e.HasKey(x => new { x.RoomId, x.AmenityId })
                .HasName("room_amenities_room_id_amenity_id_pk");
            e.HasOne<Room>().WithMany().HasForeignKey(x => x.RoomId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("room_amenities_room_id_rooms_id_fk");
            e.HasOne<Amenity>().WithMany().HasForeignKey(x => x.AmenityId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("room_amenities_amenity_id_amenities_id_fk");
        });
    }
}

internal static class HotelDetailMappings
{
    internal static void Configure(ModelBuilder model)
    {
        ConfigureGallery(model);
        ConfigureHighlightsAndFacts(model);
        ConfigureFaqsAndNearbyPlaces(model);
        ConfigurePoliciesAndReviewScores(model);
        ConfigureReviews(model);
    }

    private static void ConfigureGallery(ModelBuilder model) => model.Entity<HotelGalleryImage>(e =>
    {
        e.ToTable("hotel_gallery_images");
        e.HasKey(x => x.Id);
        e.Property(x => x.SortOrder).HasDefaultValue(0);
        e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("hotel_gallery_images_hotel_id_hotels_id_fk");
        e.HasOne<Room>().WithMany().HasForeignKey(x => x.RoomId)
            .OnDelete(DeleteBehavior.SetNull)
            .HasConstraintName("hotel_gallery_images_room_id_rooms_id_fk");
        e.HasIndex(x => new { x.HotelId, x.SortOrder },
            "hotel_gallery_images_hotel_sort_idx");
    });

    private static void ConfigureHighlightsAndFacts(ModelBuilder model)
    {
        model.Entity<HotelHighlight>(e =>
        {
            e.ToTable("hotel_highlights");
            e.HasKey(x => x.Id);
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_highlights_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_highlights_hotel_sort_idx");
        });
        model.Entity<HotelFact>(e =>
        {
            e.ToTable("hotel_facts");
            e.HasKey(x => x.Id);
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_facts_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_facts_hotel_sort_idx");
        });
    }

    private static void ConfigureFaqsAndNearbyPlaces(ModelBuilder model)
    {
        model.Entity<HotelFaq>(e =>
        {
            e.ToTable("hotel_faqs");
            e.HasKey(x => x.Id);
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_faqs_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_faqs_hotel_sort_idx");
        });
        model.Entity<HotelNearbyPlace>(e =>
        {
            e.ToTable("hotel_nearby_places");
            e.HasKey(x => x.Id);
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_nearby_places_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_nearby_places_hotel_sort_idx");
        });
    }

    private static void ConfigurePoliciesAndReviewScores(ModelBuilder model)
    {
        model.Entity<HotelPolicy>(e =>
        {
            e.ToTable("hotel_policies");
            e.HasKey(x => x.Id);
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_policies_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_policies_hotel_sort_idx");
        });
        model.Entity<HotelReviewScore>(e =>
        {
            e.ToTable("hotel_review_scores");
            e.HasKey(x => new { x.HotelId, x.Category })
                .HasName("hotel_review_scores_hotel_id_category_pk");
            e.Property(x => x.SortOrder).HasDefaultValue(0);
            e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("hotel_review_scores_hotel_id_hotels_id_fk");
            e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_review_scores_hotel_sort_idx");
        });
    }

    private static void ConfigureReviews(ModelBuilder model) => model.Entity<HotelReview>(e =>
    {
        e.ToTable("hotel_reviews");
        e.HasKey(x => x.Id);
        e.Property(x => x.SortOrder).HasDefaultValue(0);
        e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("hotel_reviews_hotel_id_hotels_id_fk");
        e.HasOne<Room>().WithMany().HasForeignKey(x => x.RoomId)
            .OnDelete(DeleteBehavior.SetNull)
            .HasConstraintName("hotel_reviews_room_id_rooms_id_fk");
        e.HasIndex(x => new { x.HotelId, x.SortOrder }, "hotel_reviews_hotel_sort_idx");
    });
}

internal static class OperationalMappings
{
    internal static void Configure(ModelBuilder model)
    {
        ConfigureMediaAndPosts(model);
        ConfigureInquiries(model);
        ConfigureAdministrationAndSnapshots(model);
    }

    private static void ConfigureMediaAndPosts(ModelBuilder model)
    {
        model.Entity<MediaAsset>(e =>
        {
            e.ToTable("media_assets");
            e.HasKey(x => x.Id);
            e.Property(x => x.FocalX).HasDefaultValue(0.5);
            e.Property(x => x.FocalY).HasDefaultValue(0.5);
            e.Property(x => x.Variants).HasColumnType("jsonb");
        });
        model.Entity<BlogPost>(e =>
        {
            e.ToTable("blog_posts");
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).HasColumnType("jsonb");
            e.Property(x => x.Status).HasDefaultValue("draft");
            e.HasIndex(x => x.Slug, "blog_posts_slug_idx").IsUnique();
        });
    }

    private static void ConfigureInquiries(ModelBuilder model) => model.Entity<Inquiry>(e =>
    {
        e.ToTable("inquiries");
        e.HasKey(x => x.Id);
        e.Property(x => x.Children).HasDefaultValue(0);
        e.Property(x => x.Status).HasDefaultValue("new");
        e.HasOne<Hotel>().WithMany().HasForeignKey(x => x.HotelId)
            .OnDelete(DeleteBehavior.ClientNoAction)
            .HasConstraintName("inquiries_hotel_id_hotels_id_fk");
        e.HasOne<Room>().WithMany().HasForeignKey(x => x.RoomId)
            .OnDelete(DeleteBehavior.ClientNoAction)
            .HasConstraintName("inquiries_room_id_rooms_id_fk");
        e.HasOne<Offer>().WithMany().HasForeignKey(x => x.OfferId)
            .OnDelete(DeleteBehavior.ClientNoAction)
            .HasConstraintName("inquiries_offer_id_offers_id_fk");
        e.HasIndex(x => new { x.Status, x.CreatedAt }, "inquiries_status_idx");
    });

    private static void ConfigureAdministrationAndSnapshots(ModelBuilder model)
    {
        model.Entity<AdminUser>(e =>
        {
            e.ToTable("admin_users");
            e.HasKey(x => x.Id);
            e.HasAlternateKey(x => x.Email).HasName("admin_users_email_unique");
        });
        model.Entity<PageSnapshot>(e =>
        {
            e.ToTable("page_snapshots");
            e.HasKey(x => x.Path);
        });
        model.Entity<SnapshotJob>(e =>
        {
            e.ToTable("snapshot_jobs");
            e.HasKey(x => x.Path);
        });
    }
}
