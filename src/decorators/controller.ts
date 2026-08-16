// Подключаем reflect-metadata, чтобы Reflect.defineMetadata/getOwnMetadata существовали в рантайме
import 'reflect-metadata';

export const CONTROLLER_PREFIX_METADATA_KEY = Symbol('controller-prefix');

export function Controller(prefix: string = ''): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_PREFIX_METADATA_KEY, prefix, target);
  };
}
