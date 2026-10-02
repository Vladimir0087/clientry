// An abstract class, not an interface: Nest injects by a runtime token and interfaces have none.
export abstract class HealthRepository {
  abstract pingDatabase(): Promise<void>;
}
