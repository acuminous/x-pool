import { Factory } from "../../index.js";

let i = 1;

export default class ExampleFactory implements Factory<string> {
  async create() {
    return `Resource ${i++}`;
  }

  async validate(resource: string) {
  }

  async destroy(resource: string) {
  }
}