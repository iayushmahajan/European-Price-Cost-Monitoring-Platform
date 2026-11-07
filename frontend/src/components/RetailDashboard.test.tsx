import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { retailOverview } from "../test/fixtures";
import { RetailDashboard } from "./RetailDashboard";

it("presents one Eurostat market workspace with comparable evidence", () => {
  render(<RetailDashboard overview={retailOverview} failed={false} />);
  expect(screen.getByText("European retail intelligence")).toBeInTheDocument();
  expect(screen.getByText("One governed dataset")).toBeInTheDocument();
  expect(screen.getByText("104.2")).toBeInTheDocument();
  expect(screen.getByText("-0.4 pts")).toBeInTheDocument();
  expect(screen.getByText("9 of 27")).toBeInTheDocument();
  expect(screen.getByText("Germany and EU-27")).toBeInTheDocument();
  expect(screen.getByText("Distance from 2021")).toBeInTheDocument();
  expect(screen.getByText("Spain")).toBeInTheDocument();
  expect(screen.getByText(/score 4.6/)).toBeInTheDocument();
  expect(screen.getByText("15,320")).toBeInTheDocument();
  expect(screen.getByText("99.9%")).toBeInTheDocument();
  expect(screen.getByText("27 / 27")).toBeInTheDocument();
  expect(screen.getByText(/does not represent revenue in euros/)).toBeInTheDocument();
});

it("explains an imported dataset with no flagged recent movements", () => {
  render(<RetailDashboard overview={{ ...retailOverview, anomalies: [] }} failed={false} />);
  expect(screen.getByText(/No movements exceeded the robust anomaly threshold/)).toBeInTheDocument();
});

it("shows actionable empty and failure states", () => {
  const { rerender } = render(<RetailDashboard overview={{ ...retailOverview, available: false }} failed={false} />);
  expect(screen.getByText("Eurostat data is ready to import")).toBeInTheDocument();
  rerender(<RetailDashboard overview={null} failed />);
  expect(screen.getByText("Market dashboard unavailable")).toBeInTheDocument();
});
