import { ProductMapper as ProductMapperGraphQL } from '../mappers/ProductMapper';
import { ProductMapper as B2BProductMapper } from 'cofe-ct-b2b-ecommerce/mappers/ProductMapper';
import { Result } from '@commercetools/frontend-domain-types/product/Result';
import { ProductQuery } from '@commercetools/frontend-domain-types/query/ProductQuery';
import { FilterTypes } from '@commercetools/frontend-domain-types/query/Filter';
import { FacetDefinition } from '@commercetools/frontend-domain-types/product/FacetDefinition';
import { TermFilter } from '@commercetools/frontend-domain-types/query/TermFilter';
import { RangeFilter } from '@commercetools/frontend-domain-types/query/RangeFilter';
import { SearchFilterInput, AdditionalQueryArgs } from '../types/query/ProductQuery';
import { productProjectionSearchQuery } from '../queries/ProductProjectionSearch';
import { CommercetoolsGraphQlProductProjection } from '../types/product/Product';
import { BaseApi } from 'cofe-ct-ecommerce/apis/BaseApi';
import { Product } from 'cofe-ct-b2b-ecommerce/types/product/Product';

export class ProductApi extends BaseApi {
  protected getGraphQlOffsetFromCursor = (cursor?: string): object => {
    if (cursor === undefined) {
      return {};
    }

    const offsetMach = cursor.match(/(?<=offset:).+/);
    return offsetMach !== null ? { offset: +Object.values(offsetMach)[0] } : {};
  };

  getSortAttributes: (productQuery: ProductQuery) => string[] = (productQuery: ProductQuery) => {
    const sortAttributes: string[] = [];
    if (productQuery.sortAttributes !== undefined) {
      Object.keys(productQuery.sortAttributes).map((field, directionIndex) => {
        sortAttributes.push(`${field} ${Object.values(productQuery.sortAttributes)[directionIndex]}`);
      });
    } else {
      // default sort
      sortAttributes.push(`variants.attributes.salesRank asc`);
    }
    return sortAttributes;
  };

  getGraphQlFilterQuery: (productQuery: ProductQuery) => SearchFilterInput[] = (productQuery: ProductQuery) => {
    const filterQuery: SearchFilterInput[] = [];
    if (productQuery.productIds !== undefined && productQuery.productIds.length !== 0) {
      filterQuery.push({ model: { value: { path: 'id', values: productQuery.productIds } } });
    }

    if (productQuery.skus !== undefined && productQuery.skus.length !== 0) {
      filterQuery.push({ model: { value: { path: 'variants.sku', values: productQuery.skus } } });
    }

    if (productQuery.category !== undefined && productQuery.category !== '') {
      filterQuery.push({
        model: { tree: { path: 'categories.id', subTreeValues: [productQuery.category], rootValues: [] } },
      });
    }

    if (productQuery.filters !== undefined) {
      productQuery.filters.forEach((filter) => {
        switch (filter.type) {
          case FilterTypes.TERM:
            filterQuery.push({
              model: { value: { path: `${filter.identifier}.key`, values: (filter as TermFilter).terms || [] } },
            });

            break;
          case FilterTypes.BOOLEAN:
            filterQuery.push({
              model: { exists: { path: filter.identifier } },
            });
            break;
          case FilterTypes.RANGE:
            if (filter.identifier === 'price') {
              // The scopedPrice filter is a commercetools price filter of a product variant selected
              // base on the price scope. The scope used is currency and country.
              filterQuery.push({
                model: {
                  range: {
                    path: 'variants.scopedPrice.value.centAmount',
                    ranges: [
                      {
                        from: (filter as RangeFilter).min?.toString() ?? '*',
                        to: (filter as RangeFilter).max?.toString() ?? '*',
                      },
                    ],
                  },
                },
              });
            }
            break;
        }
      });
    }
    return filterQuery;
  };

  getGraphQlFilterFacets: (
    productQuery: ProductQuery,
    facetDefinitions: FacetDefinition[],
  ) => Promise<SearchFilterInput[]> = async (productQuery: ProductQuery, facetDefinitions: FacetDefinition[]) => {
    const filterFacets: SearchFilterInput[] = [];
    if (productQuery.facets !== undefined) {
      filterFacets.push(
        ...ProductMapperGraphQL.facetDefinitionsToGraphQlFilterFacets(productQuery.facets, facetDefinitions),
      );
    }
    return filterFacets;
  };

  query: (
    productQuery: ProductQuery,
    additionalQueryArgs?: AdditionalQueryArgs,
    additionalFacets?: object[],
  ) => Promise<Result> = async (
    productQuery: ProductQuery,
    additionalQueryArgs?: AdditionalQueryArgs,
    additionalFacets: object[] = [],
  ) => {
    try {
      const locale = await this.getCommercetoolsLocal();
      const limit = productQuery.limit || 24;
      const { distributionChannelId, supplyChannelId, ...additionalArgs } = additionalQueryArgs || {};

      const facetDefinitions: FacetDefinition[] = [
        ...B2BProductMapper.commercetoolsProductTypesToFacetDefinitions(await this.getProductTypes(), locale),
        ...additionalFacets,
        {
          attributeId: 'categories.id',
          attributeType: 'text',
        },
        {
          attributeId: 'variants.scopedPrice.value',
          attributeType: 'money',
        },
        // Include Price facet
        {
          attributeId: 'variants.price',
          attributeType: 'money',
        },
        {
          attributeId: 'variants.scopedPriceDiscounted',
          attributeType: 'boolean',
        },
      ];
      const filterFacets = await this.getGraphQlFilterFacets(productQuery, facetDefinitions);
      const queryArgFacets = ProductMapperGraphQL.facetDefinitionsToGraphQlArgFacets(facetDefinitions, locale);
      const filterQuery = this.getGraphQlFilterQuery(productQuery);

      const variables = {
        locale: locale.language,
        currency: locale.currency,
      };

      const parameters: any = {
        limit: limit,
        sorts: this.getSortAttributes(productQuery),
        ...this.getGraphQlOffsetFromCursor(productQuery.cursor),
        priceSelector: {
          currency: locale.currency,
          country: locale.country,
        },
      };

      if (productQuery.query) {
        parameters.text = productQuery.query;
      }

      if (filterFacets.length) {
        parameters.filters = filterFacets;
        parameters['facetFilters'] = filterFacets;
      }

      if (queryArgFacets.length) {
        parameters.facets = queryArgFacets;
      }
      if (filterQuery.length) {
        parameters['queryFilters'] = filterQuery;
      }

      if (additionalArgs.storeProjection) {
        parameters.storeProjection = additionalArgs.storeProjection;
      }

      if (additionalArgs.storeProjection) {
        parameters.storeProjection = additionalArgs.storeProjection;
      }
      return await this.getApiForProject()
        .graphql()
        .post({
          body: {
            query: productProjectionSearchQuery(parameters),
            variables,
          },
        })
        .execute()
        .then((response) => {
          const items = response.body.data.productProjectionSearch.results.map((product: CommercetoolsGraphQlProductProjection) =>
            ProductMapperGraphQL.commercetoolsProductProjectionGraphQlToProduct(
              product,
              distributionChannelId,
              supplyChannelId,
            ),
          );

          const result: Result = {
            total: response.body.data.productProjectionSearch.total,
            items,
            count: response.body.data.productProjectionSearch.count,
            facets: ProductMapperGraphQL.commercetoolsFacetResultsToFacets(
              response.body.data.productProjectionSearch.facets,
              productQuery,
            ),
            previousCursor: B2BProductMapper.calculatePreviousCursor(
              response.body.data.productProjectionSearch.offset,
              response.body.data.productProjectionSearch.count,
            ),
            nextCursor: B2BProductMapper.calculateNextCursor(
              response.body.data.productProjectionSearch.offset,
              response.body.data.productProjectionSearch.count,
              response.body.data.productProjectionSearch.total,
            ),
            query: productQuery,
          };

          return result;
        })
        .catch((error) => {
          throw error;
        });
    } catch (error) {
      //TODO: better error, get status code etc...
      throw new Error(`query failed. ${error}`);
    }
  };

  getProduct: (productQuery: ProductQuery, additionalQueryArgs?: object) => Promise<Product> = async (
    productQuery: ProductQuery,
    additionalQueryArgs?: object,
  ) => {
    try {
      productQuery.limit = 1;
      const result = await this.query(productQuery, additionalQueryArgs);

      return result.items.shift() as Product;
    } catch (error) {
      //TODO: better error, get status code etc...
      throw new Error(`getProduct failed. ${error}`);
    }
  };
}
