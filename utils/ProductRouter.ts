import { Context, Request } from '@frontastic/extension-types';
import { LineItem as WishlistItem } from '@commercetools/frontend-domain-types/wishlist/LineItem';
import { ProductRouter as BaseProductRouter } from 'cofe-ct-ecommerce/utils/ProductRouter';
import { ProductApi } from '../apis/ProductApi';
import { getPath, getLocale } from 'cofe-ct-ecommerce/utils/Request';
import { LineItem } from '@commercetools/frontend-domain-types/cart/LineItem';
import { Product } from 'cofe-ct-b2b-ecommerce/types/product/Product';
import { ProductQuery } from 'cofe-ct-b2b-ecommerce/types/query/ProductQuery';

export class ProductRouter extends BaseProductRouter {
  static isProduct(product: Product | LineItem | WishlistItem): product is Product {
    return (product as Product).variants !== undefined;
  }

  static generateUrlFor(item: Product | LineItem | WishlistItem) {
    if (this.isProduct(item)) {
      return `/${item.slug}/p/${item.variants?.[0]?.sku}`;
    }
    return `/slug/p/${item.variant?.sku}`;
  }

  static identifyFrom(request: Request) {
    if (getPath(request)?.match(/\/p\/([^\/]+)/)) {
      return true;
    }

    return false;
  }

  static identifyPreviewFrom(request: Request) {
    if (getPath(request)?.match(/\/preview\/.+\/p\/([^\/]+)/)) {
      return true;
    }

    return false;
  }

  static loadFor = async (request: Request, frontasticContext: Context): Promise<Product> => {
    const productApi = new ProductApi(frontasticContext, getLocale(request));

    const urlMatches = getPath(request)?.match(/\/p\/([^\/]+)/);

    if (urlMatches) {
      const productQuery: ProductQuery = {
        skus: [urlMatches[1]],
      };
      const additionalQueryArgs = {};
           const storeKey = request.query?.['storeKey'] || request.sessionData?.organization?.store?.key;

      if (storeKey) {
        // @ts-ignore
        additionalQueryArgs.storeProjection = storeKey;
      }

      return productApi.getProduct(productQuery, additionalQueryArgs);
    }

    return null;
  };

  static loadPreviewFor = async (request: Request, frontasticContext: Context): Promise<Product> => {
    const productApi = new ProductApi(frontasticContext, getLocale(request));

    const urlMatches = getPath(request)?.match(/\/preview\/.+\/p\/([^\/]+)/);

    if (urlMatches) {
      const productQuery: ProductQuery = {
        skus: [urlMatches[1]],
      };

      const additionalQueryArgs = { staged: true };
            const storeKey = request.query?.['storeKey'] || request.sessionData?.organization?.store?.key;

      if (storeKey) {
        // @ts-ignore
        additionalQueryArgs.storeProjection = storeKey;
      }
      return productApi.getProduct(productQuery, additionalQueryArgs);
    }

    return null;
  };
}
