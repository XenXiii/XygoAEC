# Phase 1 Authorization Model

Current implementation is intentionally conservative.

## Principles

- default deny
- tenant match required
- staged sessions only
- project actions may require both tenant match and project scope
- visibility classes further restrict access

## Current working permission examples

- tenant read:
  - `platform_admin`
  - `company_admin`
  - `executive`
  - `read_only_auditor`
- project update:
  - `platform_admin`
  - `company_admin`
  - `project_manager`
  - `design_manager`
- announcement publishing:
  - `platform_admin`
  - `company_admin`
  - `executive`

## Known limitation

This is the Phase 1 baseline only. Full machine-readable matrix coverage across every resource, lifecycle state, visibility class, and deny condition will expand in later phases.
