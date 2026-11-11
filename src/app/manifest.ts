import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oqulyq Lab — Data-Driven Curriculum",
    short_name: "Oqulyq Lab",
    description: "Аналитика для методистов: трудные темы, честное сравнение учебников, план часов.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#1c1b17",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
