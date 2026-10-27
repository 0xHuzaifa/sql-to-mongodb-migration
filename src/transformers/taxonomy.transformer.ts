import { CategorySqlRow, SubcategorySqlRow } from '../extractors/reference.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformCategoryToTaxonomy(
  cat: CategorySqlRow,
  subcategories: SubcategorySqlRow[] = []
): BatchItemInput {
  const categoryName = cat.CATEG_COD.trim();

  const formattedSubcategories = subcategories.map((sub) => ({
    name: sub.SUBCAT_COD.trim(),
    description: sub.SUBCAT_DESCR ? sub.SUBCAT_DESCR.trim() : sub.SUBCAT_COD.trim(),
  }));

  const payload = {
    category: categoryName,
    subcategories: formattedSubcategories,
    parentCategory: null,
    level: 0,
  };

  return {
    identifier: categoryName,
    filter: { category: categoryName },
    payload,
    safeSummaryData: {
      CATEG_COD: categoryName,
      SUBCAT_COUNT: formattedSubcategories.length,
    },
  };
}

export function createUncategorizedTaxonomy(): BatchItemInput {
  return {
    identifier: 'UNCATEGORIZED',
    filter: { category: 'UNCATEGORIZED' },
    payload: {
      category: 'UNCATEGORIZED',
      subcategories: [{ name: 'GENERAL', description: 'General uncategorized items' }],
      level: 0,
    },
    safeSummaryData: { CATEG_COD: 'UNCATEGORIZED' },
  };
}
