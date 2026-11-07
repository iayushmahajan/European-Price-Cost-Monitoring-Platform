import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { retailOverview } from "../test/fixtures";
import { DataWorkspace, ExploreWorkspace, OverviewWorkspace } from "./MarketWorkspaces";

it("presents a concise overview with comparable market signals", () => {
  render(<MemoryRouter><OverviewWorkspace overview={retailOverview} failed={false}/></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /Retail signals/ })).toBeInTheDocument();
  expect(screen.getAllByText("104.2")).toHaveLength(2);
  expect(screen.getByText("-0.4 pts")).toBeInTheDocument();
  expect(screen.getByText("9 / 27")).toBeInTheDocument();
  expect(screen.getByText(/100 represents average retail volume/)).toBeInTheDocument();
});

it("organizes categories, countries and change detection into focused tabs", async () => {
  render(<ExploreWorkspace overview={retailOverview} failed={false}/>);
  expect(screen.getByRole("heading", { name: "Germany and EU-27" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Categories" }));
  expect(screen.getByText("Category position")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Countries" }));
  expect(screen.getByRole("table", { name: "Country benchmark" })).toHaveTextContent("Spain");
  await userEvent.click(screen.getByRole("tab", { name: "Change detection" }));
  expect(screen.getByText(/score 4.6/)).toBeInTheDocument();
});

it("keeps quality, provenance and methodology accessible", () => {
  render(<DataWorkspace overview={retailOverview} failed={false}/>);
  expect(screen.getByText("Dataset operational")).toBeInTheDocument();
  expect(screen.getByText("15,320")).toBeInTheDocument();
  expect(screen.getByText("99.9%")).toBeInTheDocument();
  expect(screen.getByText(/2021 average = 100/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Open Eurostat dataset/ })).toBeInTheDocument();
});

it("shows useful unavailable and loading states", () => {
  const { rerender } = render(<OverviewWorkspace overview={null} failed={false}/>);
  expect(screen.getByText("Preparing market intelligence…")).toBeInTheDocument();
  rerender(<OverviewWorkspace overview={null} failed/>);
  expect(screen.getByText("Market data unavailable")).toBeInTheDocument();
});
