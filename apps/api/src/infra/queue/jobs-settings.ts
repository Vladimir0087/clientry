export class JobsSettings {
  constructor(readonly shouldRunJobs: boolean) {
    Object.freeze(this);
  }
}
