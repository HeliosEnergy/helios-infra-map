
# Spec Driven Plan: Circle Sizing Control

This document outlines the plan for implementing a new feature that allows users to control the sizing of power plant markers on the map.

## 1. Feature: Circle Sizing Control

This feature will add a new collapsible section to the side panel that allows users to customize the appearance of power plant markers. Users will be able to control the base size of the markers, the data emphasis, and the attribute used to size the circles.

## 2. UI/UX Design

A new collapsible section titled "**Circle Sizing**" will be added to the side panel. This section will contain the following controls:

*   **Base Size**: A slider that allows users to set the base radius for all power plant markers.
*   **Data Emphasis**: A slider that allows users to control how much the selected data attribute affects the size of the markers.
*   **Size Circles By**: A radio button group with the following options:
    *   Nameplate Capacity
    *   Capacity Factor
    *   Generation

## 3. Component Breakdown

The following components will be created or modified to implement this feature:

*   **`SidePanel.tsx`**: This component will be modified to include the new "Circle Sizing" section.
*   **`CircleSizingControl.tsx`**: A new component that will encapsulate the UI controls for circle sizing.
*   **`App.tsx`**: This component will be modified to manage the state for the circle sizing options and pass them down to the Deck.gl layer.
*   **`PowerPlantLayer.tsx`** (or a similar component): The Deck.gl layer responsible for rendering the power plant markers will be modified to use the new sizing options.

## 4. Data Flow

1.  The UI controls in the `CircleSizingControl.tsx` component will update the state in the `App.tsx` component.
2.  The state from `App.tsx` will be passed as props to the `PowerPlantLayer.tsx` component.
3.  The `getRadius` accessor of the `ScatterplotLayer` in `PowerPlantLayer.tsx` will use these props to calculate the radius of each circle. The calculation will be based on the selected attribute ("Nameplate Capacity", "Capacity Factor", or "Generation") and the "Base Size" and "Data Emphasis" values.

## 5. Data Availability

The current power plant data sources (`Power_Plants,_100_MW_or_more.csv` and `Renewable_Energy_Power_Plants,_1_MW_or_more.csv`) do not contain data for "Capacity Factor" or "Generation". The "Nameplate Capacity" is available as `Total Capacity (MW)`.

This means that the "Size Circles By" feature can only be fully implemented for "Nameplate Capacity". For "Capacity Factor" and "Generation", we will need to either:

1.  Obtain new data sources that include this information.
2.  Use estimated or calculated values.
3.  Remove these options from the UI.

## 6. Implementation Steps

1.  **Create the `CircleSizingControl.tsx` component**: This component will contain the sliders and radio buttons for controlling the circle sizing.
2.  **Add the `CircleSizingControl` component to `SidePanel.tsx`**: The new component will be placed within a new collapsible section in the side panel.
3.  **Add state management in `App.tsx`**: New state variables will be added to `App.tsx` to store the values from the circle sizing controls.
4.  **Update the `PowerPlantLayer.tsx`**: The `PowerPlantLayer.tsx` component will be updated to receive the circle sizing options as props and use them to dynamically calculate the radius of the power plant markers.
5.  **Connect the UI to the state and the state to the Deck.gl layer**: The UI controls will be connected to the state variables in `App.tsx`, and the state variables will be passed as props to the `PowerPlantLayer.tsx`.
