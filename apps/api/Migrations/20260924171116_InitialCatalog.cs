using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "admin_users",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_admin_users", x => x.id);
                    table.UniqueConstraint("admin_users_email_unique", x => x.email);
                });

            migrationBuilder.CreateTable(
                name: "amenities",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    icon = table.Column<string>(type: "text", nullable: false, defaultValue: "sparkles"),
                    applies_to = table.Column<string>(type: "text", nullable: false, defaultValue: "both"),
                    category = table.Column<string>(type: "text", nullable: false, defaultValue: "services")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_amenities", x => x.id);
                    table.UniqueConstraint("amenities_name_unique", x => x.name);
                });

            migrationBuilder.CreateTable(
                name: "blog_posts",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    slug = table.Column<string>(type: "text", nullable: false),
                    excerpt = table.Column<string>(type: "text", nullable: false),
                    author = table.Column<string>(type: "text", nullable: false),
                    hero_image = table.Column<string>(type: "text", nullable: false),
                    content = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    seo_title = table.Column<string>(type: "text", nullable: false),
                    seo_description = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    published_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_blog_posts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "destinations",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    slug = table.Column<string>(type: "text", nullable: false),
                    country = table.Column<string>(type: "text", nullable: false),
                    eyebrow = table.Column<string>(type: "text", nullable: false, defaultValue: "Destination"),
                    summary = table.Column<string>(type: "text", nullable: false),
                    content = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    hero_image = table.Column<string>(type: "text", nullable: false),
                    seo_title = table.Column<string>(type: "text", nullable: false),
                    seo_description = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    published_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_destinations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "media_assets",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    filename = table.Column<string>(type: "text", nullable: false),
                    mime_type = table.Column<string>(type: "text", nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    alt = table.Column<string>(type: "text", nullable: false),
                    caption = table.Column<string>(type: "text", nullable: true),
                    focal_x = table.Column<double>(type: "double precision", nullable: false, defaultValue: 0.5),
                    focal_y = table.Column<double>(type: "double precision", nullable: false, defaultValue: 0.5),
                    variants = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_assets", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "page_snapshots",
                columns: table => new
                {
                    path = table.Column<string>(type: "text", nullable: false),
                    html = table.Column<string>(type: "text", nullable: false),
                    asset_version = table.Column<string>(type: "text", nullable: false),
                    generated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_page_snapshots", x => x.path);
                });

            migrationBuilder.CreateTable(
                name: "snapshot_jobs",
                columns: table => new
                {
                    path = table.Column<string>(type: "text", nullable: false),
                    desired_version = table.Column<string>(type: "text", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    leased_until = table.Column<DateTime>(type: "timestamp without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_snapshot_jobs", x => x.path);
                });

            migrationBuilder.CreateTable(
                name: "hotels",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    destination_id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    slug = table.Column<string>(type: "text", nullable: false),
                    property_type = table.Column<string>(type: "text", nullable: false, defaultValue: "Boutique hotel"),
                    address = table.Column<string>(type: "text", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    hero_image = table.Column<string>(type: "text", nullable: false),
                    rating = table.Column<double>(type: "double precision", nullable: false),
                    star_rating = table.Column<int>(type: "integer", nullable: true),
                    review_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    price_from = table.Column<int>(type: "integer", nullable: false),
                    currency = table.Column<string>(type: "text", nullable: false, defaultValue: "USD"),
                    latitude = table.Column<double>(type: "double precision", nullable: true),
                    longitude = table.Column<double>(type: "double precision", nullable: true),
                    seo_title = table.Column<string>(type: "text", nullable: false),
                    seo_description = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    published_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotels", x => x.id);
                    table.ForeignKey(
                        name: "hotels_destination_id_destinations_id_fk",
                        column: x => x.destination_id,
                        principalTable: "destinations",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "hotel_amenities",
                columns: table => new
                {
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    amenity_id = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("hotel_amenities_hotel_id_amenity_id_pk", x => new { x.hotel_id, x.amenity_id });
                    table.ForeignKey(
                        name: "hotel_amenities_amenity_id_amenities_id_fk",
                        column: x => x.amenity_id,
                        principalTable: "amenities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "hotel_amenities_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_facts",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    group = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    value = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_facts", x => x.id);
                    table.ForeignKey(
                        name: "hotel_facts_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_faqs",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    question = table.Column<string>(type: "text", nullable: false),
                    answer = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_faqs", x => x.id);
                    table.ForeignKey(
                        name: "hotel_faqs_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_highlights",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false),
                    icon = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_highlights", x => x.id);
                    table.ForeignKey(
                        name: "hotel_highlights_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_nearby_places",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    distance_meters = table.Column<int>(type: "integer", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_nearby_places", x => x.id);
                    table.ForeignKey(
                        name: "hotel_nearby_places_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_policies",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_policies", x => x.id);
                    table.ForeignKey(
                        name: "hotel_policies_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_review_scores",
                columns: table => new
                {
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    score = table.Column<double>(type: "double precision", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("hotel_review_scores_hotel_id_category_pk", x => new { x.hotel_id, x.category });
                    table.ForeignKey(
                        name: "hotel_review_scores_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "offers",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    slug = table.Column<string>(type: "text", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false),
                    image = table.Column<string>(type: "text", nullable: false),
                    discount_percent = table.Column<int>(type: "integer", nullable: true),
                    valid_from = table.Column<string>(type: "text", nullable: true),
                    valid_to = table.Column<string>(type: "text", nullable: true),
                    terms = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_offers", x => x.id);
                    table.ForeignKey(
                        name: "offers_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rooms",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    slug = table.Column<string>(type: "text", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false),
                    image = table.Column<string>(type: "text", nullable: false),
                    price_from = table.Column<int>(type: "integer", nullable: false),
                    max_guests = table.Column<int>(type: "integer", nullable: false),
                    size_sqm = table.Column<int>(type: "integer", nullable: true),
                    bed = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rooms", x => x.id);
                    table.ForeignKey(
                        name: "rooms_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hotel_gallery_images",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    room_id = table.Column<string>(type: "text", nullable: true),
                    src = table.Column<string>(type: "text", nullable: false),
                    alt = table.Column<string>(type: "text", nullable: false),
                    caption = table.Column<string>(type: "text", nullable: true),
                    category = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_gallery_images", x => x.id);
                    table.ForeignKey(
                        name: "hotel_gallery_images_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "hotel_gallery_images_room_id_rooms_id_fk",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "hotel_reviews",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    room_id = table.Column<string>(type: "text", nullable: true),
                    guest_name = table.Column<string>(type: "text", nullable: false),
                    guest_country = table.Column<string>(type: "text", nullable: false),
                    traveler_type = table.Column<string>(type: "text", nullable: false),
                    rating = table.Column<double>(type: "double precision", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    stayed_at = table.Column<string>(type: "text", nullable: false),
                    reviewed_at = table.Column<string>(type: "text", nullable: false),
                    nights = table.Column<int>(type: "integer", nullable: false),
                    response = table.Column<string>(type: "text", nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hotel_reviews", x => x.id);
                    table.ForeignKey(
                        name: "hotel_reviews_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "hotel_reviews_room_id_rooms_id_fk",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "inquiries",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    hotel_id = table.Column<string>(type: "text", nullable: false),
                    room_id = table.Column<string>(type: "text", nullable: true),
                    offer_id = table.Column<string>(type: "text", nullable: true),
                    check_in = table.Column<string>(type: "text", nullable: false),
                    check_out = table.Column<string>(type: "text", nullable: false),
                    adults = table.Column<int>(type: "integer", nullable: false),
                    children = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    name = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    phone = table.Column<string>(type: "text", nullable: true),
                    message = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "new"),
                    created_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inquiries", x => x.id);
                    table.ForeignKey(
                        name: "inquiries_hotel_id_hotels_id_fk",
                        column: x => x.hotel_id,
                        principalTable: "hotels",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "inquiries_offer_id_offers_id_fk",
                        column: x => x.offer_id,
                        principalTable: "offers",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "inquiries_room_id_rooms_id_fk",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "room_amenities",
                columns: table => new
                {
                    room_id = table.Column<string>(type: "text", nullable: false),
                    amenity_id = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("room_amenities_room_id_amenity_id_pk", x => new { x.room_id, x.amenity_id });
                    table.ForeignKey(
                        name: "room_amenities_amenity_id_amenities_id_fk",
                        column: x => x.amenity_id,
                        principalTable: "amenities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "room_amenities_room_id_rooms_id_fk",
                        column: x => x.room_id,
                        principalTable: "rooms",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "blog_posts_slug_idx",
                table: "blog_posts",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "destinations_slug_idx",
                table: "destinations",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_hotel_amenities_amenity_id",
                table: "hotel_amenities",
                column: "amenity_id");

            migrationBuilder.CreateIndex(
                name: "hotel_facts_hotel_sort_idx",
                table: "hotel_facts",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_faqs_hotel_sort_idx",
                table: "hotel_faqs",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_gallery_images_hotel_sort_idx",
                table: "hotel_gallery_images",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "IX_hotel_gallery_images_room_id",
                table: "hotel_gallery_images",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "hotel_highlights_hotel_sort_idx",
                table: "hotel_highlights",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_nearby_places_hotel_sort_idx",
                table: "hotel_nearby_places",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_policies_hotel_sort_idx",
                table: "hotel_policies",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_review_scores_hotel_sort_idx",
                table: "hotel_review_scores",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "hotel_reviews_hotel_sort_idx",
                table: "hotel_reviews",
                columns: new[] { "hotel_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "IX_hotel_reviews_room_id",
                table: "hotel_reviews",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "hotels_destination_idx",
                table: "hotels",
                column: "destination_id");

            migrationBuilder.CreateIndex(
                name: "hotels_search_idx",
                table: "hotels",
                columns: new[] { "status", "price_from", "rating" });

            migrationBuilder.CreateIndex(
                name: "hotels_slug_idx",
                table: "hotels",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "inquiries_status_idx",
                table: "inquiries",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_inquiries_hotel_id",
                table: "inquiries",
                column: "hotel_id");

            migrationBuilder.CreateIndex(
                name: "IX_inquiries_offer_id",
                table: "inquiries",
                column: "offer_id");

            migrationBuilder.CreateIndex(
                name: "IX_inquiries_room_id",
                table: "inquiries",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "offers_hotel_slug_idx",
                table: "offers",
                columns: new[] { "hotel_id", "slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_room_amenities_amenity_id",
                table: "room_amenities",
                column: "amenity_id");

            migrationBuilder.CreateIndex(
                name: "rooms_hotel_slug_idx",
                table: "rooms",
                columns: new[] { "hotel_id", "slug" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "admin_users");

            migrationBuilder.DropTable(
                name: "blog_posts");

            migrationBuilder.DropTable(
                name: "hotel_amenities");

            migrationBuilder.DropTable(
                name: "hotel_facts");

            migrationBuilder.DropTable(
                name: "hotel_faqs");

            migrationBuilder.DropTable(
                name: "hotel_gallery_images");

            migrationBuilder.DropTable(
                name: "hotel_highlights");

            migrationBuilder.DropTable(
                name: "hotel_nearby_places");

            migrationBuilder.DropTable(
                name: "hotel_policies");

            migrationBuilder.DropTable(
                name: "hotel_review_scores");

            migrationBuilder.DropTable(
                name: "hotel_reviews");

            migrationBuilder.DropTable(
                name: "inquiries");

            migrationBuilder.DropTable(
                name: "media_assets");

            migrationBuilder.DropTable(
                name: "page_snapshots");

            migrationBuilder.DropTable(
                name: "room_amenities");

            migrationBuilder.DropTable(
                name: "snapshot_jobs");

            migrationBuilder.DropTable(
                name: "offers");

            migrationBuilder.DropTable(
                name: "amenities");

            migrationBuilder.DropTable(
                name: "rooms");

            migrationBuilder.DropTable(
                name: "hotels");

            migrationBuilder.DropTable(
                name: "destinations");
        }
    }
}
