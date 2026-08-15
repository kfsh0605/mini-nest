// Подключаем reflect-metadata, чтобы Reflect.getMetadata/defineMetadata существовали в рантайме
import 'reflect-metadata';

// Токен может быть строкой или символом
export type InjectionToken = string | symbol;

// Отдельный ключ метаданных, под которым храним карту "индекс параметра -> токен"
export const INJECT_METADATA_KEY = Symbol('inject-tokens');

// Фабрика: вызов @Inject(token) возвращает сам декоратор параметра
export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    // getOwnMetadata (не getMetadata!) — иначе для класса-наследника без собственной карты
    // токенов мы бы прочитали (и затем случайно замутировали) карту РОДИТЕЛЯ, потому что
    // getMetadata ходит вверх по цепочке прототипов, а getOwnMetadata — нет.
    const existingTokens: Record<number, InjectionToken> =
      Reflect.getOwnMetadata(INJECT_METADATA_KEY, target) ?? {};

    existingTokens[parameterIndex] = token;

    Reflect.defineMetadata(INJECT_METADATA_KEY, existingTokens, target);
  };
}
