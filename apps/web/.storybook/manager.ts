import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

addons.setConfig({
  theme: create({ base: "light", brandTitle: "Sidevoice · Design system", brandUrl: "https://sidevoice.ai" }),
});
