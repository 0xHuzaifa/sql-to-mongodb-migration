// MongoDB Indexes for Product Assignment System
// These indexes should be applied to the respective models after they are defined
// Add these to each model file's schema definition

// INDEX DEFINITIONS FOR MANUAL APPLICATION:
//
// In GroupProductAssignment.model.ts, add after schema definition:
// GroupProductAssignmentSchema.index({ pageId: 1, employeeGroupId: 1, productId: 1 }, { unique: true, name: "group_product_assignment_unique", background: true });
// GroupProductAssignmentSchema.index({ pageId: 1, employeeGroupId: 1, isActive: 1 }, { name: "group_assignments_active", background: true });
// GroupProductAssignmentSchema.index({ pageId: 1, employeeGroupId: 1, assignmentType: 1 }, { name: "group_assignments_by_type", background: true });
//
// In EmployeeGroup.model.ts, add after schema definition:
// EmployeeGroupSchema.index({ _id: 1, "assignedCategories.categoryId": 1 }, { name: "employee_group_assigned_categories", background: true, sparse: true });
// EmployeeGroupSchema.index({ pageId: 1 }, { name: "employee_group_page", background: true });
//
// In Page.model.ts, add after schema definition:
// PageSchema.index({ _id: 1 }, { name: "page_id", background: true });
//
// In Product.model.ts, add after schema definition:
// ProductSchema.index({ category: 1 }, { name: "product_category", background: true, sparse: true });
// ProductSchema.index({ category: 1, subcategory: 1 }, { name: "product_category_subcategory", background: true, sparse: true });
// ProductSchema.index({ _id: 1 }, { name: "product_id", background: true });
//
// In Taxonomy.model.ts, add after schema definition:
// TaxonomySchema.index({ category: 1 }, { unique: true, name: "taxonomy_category_unique", background: true });
// TaxonomySchema.index({ _id: 1 }, { name: "taxonomy_id", background: true });
//
// In SyncLog.model.ts, add after schema definition:
// SyncLogSchema.index({ syncId: 1 }, { unique: true, name: "sync_log_sync_id_unique", background: true });
// SyncLogSchema.index({ vendorId: 1, status: 1 }, { name: "sync_log_vendor_status", background: true });
// SyncLogSchema.index({ createdAt: 1 }, { name: "sync_log_created_at", background: true, expireAfterSeconds: 86400 });
//
// In Alteration.model.ts, add after schema definition:
// AlterationSchema.index({ _id: 1 }, { name: "alteration_id", background: true });

// INDEX IMPACT ANALYSIS:
//
// HIGH IMPACT (Critical for bulk assignment performance):
// - GroupProductAssignment: { pageId, employeeGroupId, productId } - Eliminates duplicate assignment checks
// - GroupProductAssignment: { pageId, employeeGroupId, isActive } - Used in getVisibleProductIds
// - Taxonomy: { category } - Eliminates 7,000+ lookups per group during bulk assignment
// - Product: { category, subcategory } - Used in getVisibleProductIds batch queries
//
// MEDIUM IMPACT:
// - EmployeeGroup: { pageId } - Group validation during assignment
// - SyncLog: { syncId } - Polling performance (called every 3-10 seconds)
// - Product: { category } - Category assignment queries
//
// LOW IMPACT:
// - _id indexes - Already exist by default
// - Sparse indexes - Only apply to documents with the field
//
// TOTAL EXPECTED IMPROVEMENT:
// - Bulk assignment: 40-60% faster (from ~8 minutes to ~3-5 minutes)
// - getVisibleProductIds: 70-80% faster (from ~7 seconds to ~1-2 seconds per group)
// - Polling: 50% faster response times
//
// IMPLEMENTATION NOTES:
// - All indexes created with background: true to avoid blocking operations
// - Unique constraints prevent duplicate assignments
// - Sparse indexes only created for documents that have the indexed fields
// - TTL index on SyncLog auto-cleans old polling data

// INDEX IMPACT ANALYSIS:
//
// HIGH IMPACT (Critical for bulk assignment performance):
// - GroupProductAssignment: { pageId, employeeGroupId, productId } - Eliminates duplicate assignment checks
// - GroupProductAssignment: { pageId, employeeGroupId, isActive } - Used in getVisibleProductIds
// - Taxonomy: { category } - Eliminates 7,000+ lookups per group during bulk assignment
// - Product: { category, subcategory } - Used in getVisibleProductIds batch queries
//
// MEDIUM IMPACT:
// - EmployeeGroup: { pageId } - Group validation during assignment
// - SyncLog: { syncId } - Polling performance (called every 3-10 seconds)
// - Product: { category } - Category assignment queries
//
// LOW IMPACT:
// - _id indexes - Already exist by default
// - Sparse indexes - Only apply to documents with the field
//
// TOTAL EXPECTED IMPROVEMENT:
// - Bulk assignment: 40-60% faster (from ~8 minutes to ~3-5 minutes)
// - getVisibleProductIds: 70-80% faster (from ~7 seconds to ~1-2 seconds per group)
// - Polling: 50% faster response times
//
// IMPLEMENTATION NOTES:
// - All indexes created with background: true to avoid blocking operations
// - Unique constraints prevent duplicate assignments
// - Sparse indexes only created for documents that have the indexed fields
// - TTL index on SyncLog auto-cleans old polling data