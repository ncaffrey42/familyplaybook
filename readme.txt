# Family Playbook App - Project Overview

This document provides a detailed summary of the Family Playbook application, outlining its core purpose, features, and technical architecture based on our development history.

## 1. Core Purpose

The Family Playbook is a household organization and information management application designed to centralize all essential family knowledge. It acts as a digital playbook for your home, making it easy for family members, babysitters, house guests, and caregivers to find information quickly and reliably.

The core mission is to eliminate repetitive questions and frantic searching by providing a single, trusted source for everything from "How-To" instructions to the location of important items.

---

## 2. Key Concepts & Structure

The app is built around two primary components: **Guides** and **Bundles**.

*   **Guides:** These are individual, single-purpose documents. Each guide contains specific information and can be categorized.
    *   **Examples:** "How to Use the Smart TV," "Emergency Contact List," "Where to Find the Spare Keys."
    *   **Properties:** Name, Icon, Description, Category (`How To`, `Find It`, `Reference`), and content/steps.
    *   **Content Types:** Guides can contain simple text, checklists, or structured steps with titles and descriptions.

*   **Bundles (formerly Packs):** These are curated collections of Guides, grouped together for a specific context or audience.
    *   **Examples:** "Babysitter Essentials," "House Guest Welcome Kit," "New Pet Info."
    *   **Properties:** Name, Description, Color, and a Cover Image.

*   **The Library:** This is a central, pre-populated repository of professionally created template Guides and Bundles. Users can browse the Library and import items directly into their own collection with a single click, providing a fantastic starting point for building their playbook.

---

## 3. Core Application Features

### User & Account Management
*   **Authentication:** A complete user authentication system including email/password sign-up, a "Check Your Email" confirmation screen, and login.
*   **My Account:** A dedicated screen where users can manage their profile information (name, avatar), handle subscription details, and perform account actions like exporting or resetting their data.
*   **Family Members:** A system to invite other family members via email to share access to the playbook.
*   **Onboarding:** A friendly, multi-step welcome screen for new users to introduce them to the app's concepts.

### Content Creation & Management
*   **My Guides:** A personalized library where users can view all their created and imported guides. From here, they can search, filter by category, and access actions.
*   **My Bundles:** A screen displaying all the user's bundles, showing their cover image and guide count.
*   **Create/Edit Guides:** A full-featured editor for creating or modifying guides. Users can set the title, icon, category, and add structured steps or content.
*   **Create/Edit Bundles:** An editor for creating or modifying bundles. Users can define the name, description, color, and upload a custom cover image. They can also add or remove guides from a bundle.

### Library & Content Discovery
*   **Seamless Library Import:** The ability to browse the central Library and add template Guides or entire Bundles to a user's personal collection.
*   **"Add" vs. "Add & Edit":** When importing from the library, users have two choices:
    1.  **Add:** Simply adds the item to their collection.
    2.  **Add & Edit:** Adds the item and immediately navigates the user to the edit screen to begin personalizing it.
*   **Smart Filtering:** The library intelligently hides items that the user has already imported, preventing duplicates.

### User Experience & Navigation
*   **Dashboard (Home Screen):** A central hub that provides an overview and quick access to recent or important information.
*   **Bottom Navigation:** A persistent navigation bar on mobile for easy access to core sections: Home, Bundles, Guides, and Favorites.
*   **Favorites:** Users can "favorite" any of their guides for quick access from a dedicated Favorites screen.
*   **Robust Search:** A search bar is available to quickly find specific guides.
*   **Archiving:** Users can archive old or unused Guides and Bundles instead of permanently deleting them, keeping their active playbook clean.
*   **Progressive Web App (PWA):** The app can be "installed" on a user's home screen for a native-app-like experience, complete with an icon and offline capabilities.

### Sharing & Collaboration
*   **Public Sharing:** Users can generate unique, public links to share specific Guides or Bundles with people outside the app (e.g., sending a link to a house sitter).
*   **Host Mode:** A feature designed to provide temporary, controlled access to the playbook for guests.

---
*This document will be updated as new features are added to the application.*