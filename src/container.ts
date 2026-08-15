// Подключаем reflect-metadata, чтобы Reflect.getMetadata/hasMetadata существовали в рантайме
import 'reflect-metadata';
// Импортируем ключи метаданных и тип Scope из декоратора @Injectable
import { INJECTABLE_METADATA_KEY, SCOPE_METADATA_KEY, Scope } from './decorators/injectable';
// Импортируем ключ метаданных и тип токена из декоратора @Inject
import { INJECT_METADATA_KEY, InjectionToken } from './decorators/inject';

// Вспомогательный тип: "любой класс, который можно создать через new и который возвращает T"
type Ctor<T = unknown> = new (...args: any[]) => T;

// Сам контейнер — класс, чтобы в разных тестах можно было создавать независимые
// экземпляры контейнера, каждый со своим собственным кэшем синглтонов
export class Container {
  // Кэш уже созданных singleton-экземпляров: ключ — класс, значение — готовый объект
  private singletons = new Map<Ctor, unknown>();
  // Реестр значений, зарегистрированных под токеном (для параметров с @Inject(token))
  private tokenRegistry = new Map<InjectionToken, unknown>();

  // Метод регистрации готового значения под токеном (для зависимостей без класса)
  register(token: InjectionToken, value: unknown): void {
    // Просто сохраняем пару токен -> значение
    this.tokenRegistry.set(token, value);
  }

  // Главный метод: создаёт (или берёт из кэша) экземпляр класса target.
  // path — цепочка КЛАССОВ (не имён!), пройденных в текущем резолве — нужна для детекции циклов.
  // Сравниваем классы по ссылке, а не по .name: два разных класса с одинаковым именем
  // (например, два разных DTO по имени "Response" в разных файлах) не должны считаться циклом.
  resolve<T>(target: Ctor<T>, path: Ctor[] = []): T {
    // Класс без СОБСТВЕННОГО @Injectable() контейнер создавать не имеет права.
    // hasOwnMetadata (не hasMetadata!) — hasMetadata подтвердит true и для наследника,
    // у которого своего декоратора нет, но декоратор есть у родителя по цепочке прототипов.
    if (!Reflect.hasOwnMetadata(INJECTABLE_METADATA_KEY, target)) {
      // Явная ошибка с именем класса вместо непонятного сбоя дальше по коду
      throw new Error(`${target.name} is not marked with @Injectable()`);
    }

    // Читаем scope класса из метаданных, по умолчанию singleton
    const scope: Scope = Reflect.getMetadata(SCOPE_METADATA_KEY, target) ?? 'singleton';

    // Если это singleton и он уже был создан ранее — отдаём готовый объект из кэша
    if (scope === 'singleton' && this.singletons.has(target)) {
      // Приводим тип: Map хранит unknown, но мы точно знаем, что там лежит T
      return this.singletons.get(target) as T;
    }

    // Если текущий класс уже встречается в пройденном пути — значит, это цикл.
    // includes ищет строгое равенство (===), то есть сравнивает сами классы, а не их имена.
    if (path.includes(target)) {
      // Имена классов нужны только здесь, для читаемого текста ошибки
      const chain = [...path, target].map((cls) => cls.name).join(' -> ');
      throw new Error(`Circular dependency detected: ${chain}`);
    }

    // Читаем типы параметров конструктора, которые TypeScript положил при компиляции
    const paramTypes: Ctor[] = Reflect.getMetadata('design:paramtypes', target) ?? [];
    // Читаем карту "индекс параметра -> токен", которую записал декоратор @Inject
    const injectTokens: Record<number, InjectionToken> =
      Reflect.getMetadata(INJECT_METADATA_KEY, target) ?? {};

    // Добавляем текущий класс (сам объект, не имя) в конец пути перед тем, как идти вглубь
    const nextPath = [...path, target];

    // Для каждого параметра конструктора решаем, чем именно его заполнить
    const args = paramTypes.map((paramType, index) => {
      // Проверяем, зарегистрирован ли для этого индекса явный токен через @Inject
      const token = injectTokens[index];

      // Если токен указан — берём готовое значение из реестра токенов, а не создаём по типу
      if (token !== undefined) {
        // Если под этим токеном ничего не зарегистрировано — явная ошибка конфигурации
        if (!this.tokenRegistry.has(token)) {
          // Называем и токен, и место, где он не найден
          throw new Error(
            `No provider registered for token ${String(token)} (parameter ${index} of ${target.name})`,
          );
        }
        // Возвращаем значение из реестра токенов как есть
        return this.tokenRegistry.get(token);
      }

      // Токена нет — резолвим зависимость обычным способом, рекурсивно, по типу параметра
      return this.resolve(paramType, nextPath);
    });

    // Создаём экземпляр класса, передавая в конструктор все собранные зависимости
    const instance = new target(...(args as any[]));

    // Если класс singleton — сохраняем созданный экземпляр в кэш для будущих resolve
    if (scope === 'singleton') {
      // Теперь повторный resolve(target) вернёт именно этот же объект
      this.singletons.set(target, instance);
    }

    // Возвращаем готовый экземпляр вызывающему коду
    return instance;
  }
}
