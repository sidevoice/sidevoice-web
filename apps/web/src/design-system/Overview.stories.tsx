import type { Meta, StoryObj } from "@storybook/react-vite";
import { composeStories } from "@storybook/react-vite";
import { toId } from "storybook/internal/csf";
import { Component, type ComponentType, type ReactNode } from "react";
import "./overview.css";

/* Every component on one page, as a board to look at (the catalogue's answer to a Figma canvas): one specimen of each, from
 * its own story file, grouped as the sidebar groups them; its name opens its full page. Nothing is listed by hand: a new
 * story file shows here by itself. */

type Module = { default: { title: string } } & Record<string, unknown>;
const modules = import.meta.glob<Module>("../**/*.stories.tsx", { eager: true });

/** The story that best shows a component at a glance, by name; else its first. */
const SHOWCASE = ["Variants", "Tones", "SideBySide", "States", "StageAndTranscript", "Sizes", "Line", "Expanded", "InCall", "Builds", "Interactive", "Default"];

interface Specimen { title: string; group: string; name: string; id: string; Story: ComponentType }

function specimens(): Specimen[] {
  return Object.entries(modules).flatMap(([path, module]) => {
    const title = module.default?.title;
    if (!title || /Overview\.stories|foundations\//.test(path)) return [];
    const composed = composeStories(module as never) as Record<string, ComponentType & { storyName?: string }>;
    const names = Object.keys(composed);
    const name = SHOWCASE.find((wanted) => names.includes(wanted)) ?? names.find((n) => n !== "Playground") ?? names[0];
    if (!name) return [];
    const [group] = title.split("/");
    return [{ title: title.split("/").slice(1).join(" / "), group, name, id: toId(title, name), Story: composed[name] }];
  }).sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
}

/** One specimen that fails to draw on its own says so, and the board goes on. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="ov-failed">Open its page to see it.</p> : this.props.children; }
}

function Board() {
  const all = specimens();
  const groups = [...new Set(all.map((specimen) => specimen.group))];
  return (
    <div className="ov-board">
      {groups.map((group) => (
        <section key={group} className="ov-group">
          <h2>{group}</h2>
          <div className="ov-grid">
            {all.filter((specimen) => specimen.group === group).map(({ title, name, id, Story }) => (
              <article key={id} className="ov-card">
                <a className="ov-name" href={`/?path=/story/${id}`} target="_top">{title} <span>· {name}</span></a>
                <div className="ov-art"><Guard><Story /></Guard></div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: "Overview",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllComponents: Story = { name: "All components", render: () => <Board /> };
