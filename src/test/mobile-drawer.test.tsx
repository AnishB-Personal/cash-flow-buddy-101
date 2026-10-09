import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MockSessionProvider } from '@/components/collectflow/session';
import { Workspace } from '@/components/collectflow/workspace';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

function mount(initial: 'Orders' | 'Invoices' | 'Dashboard' = 'Orders') {
  return render(
    <MockSessionProvider>
      <Workspace initial={initial} />
    </MockSessionProvider>
  );
}

describe('Mobile Workflow Drawer & Scroll Lock', () => {
  it('anchors drawer properly and displays accessible header and close button', async () => {
    mount('Orders');

    const openBtn = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!;
    expect(openBtn).toBeDefined();
    fireEvent.click(openBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('cf-drawer');

    // Header anchoring and contents
    const header = dialog.querySelector('.cf-drawer-header');
    expect(header).not.toBeNull();
    expect(header).toHaveTextContent('PO-NEXUS-881');
    expect(header).toHaveTextContent('ORDER DETAILS');

    // Close button in header
    const closeBtn = screen.getByRole('button', { name: 'Close record details' });
    expect(closeBtn).toBeInTheDocument();
    expect(header?.contains(closeBtn)).toBe(true);

    // Body and footer
    const body = dialog.querySelector('.cf-drawer-body');
    expect(body).not.toBeNull();
    const footer = dialog.querySelector('.cf-drawer-footer');
    expect(footer).not.toBeNull();

    // Close drawer
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('anchors drawer and overlay inside the frame in embedded phone preview (.cf-preview-mobile)', async () => {
    mount('Orders');

    // Switch to mobile preview
    const mobileToggle = screen.getByRole('button', { name: 'Mobile preview' });
    fireEvent.click(mobileToggle);

    const appContainer = document.querySelector('.cf-app');
    expect(appContainer).toHaveClass('cf-preview-mobile');

    const frame = document.querySelector('.cf-frame');
    expect(frame).not.toBeNull();

    // Open record drawer in mobile preview
    const openBtn = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!;
    fireEvent.click(openBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(frame?.contains(dialog)).toBe(true);

    const overlay = document.querySelector('.cf-overlay');
    expect(overlay).not.toBeNull();
    expect(frame?.contains(overlay)).toBe(true);

    const header = dialog.querySelector('.cf-drawer-header');
    expect(header).not.toBeNull();
    const closeBtn = screen.getByRole('button', { name: 'Close record details' });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('applies cf-scroll-locked class on modal open and removes on modal close', async () => {
    mount('Orders');

    const shell = document.querySelector('.cf-shell');
    expect(shell).not.toBeNull();
    expect(document.body).not.toHaveClass('cf-scroll-locked');
    expect(shell).not.toHaveClass('cf-scroll-locked');

    // Open record drawer in real / non-mobile viewport
    const openBtn = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!;
    fireEvent.click(openBtn);
    await screen.findByRole('dialog');

    expect(document.body).toHaveClass('cf-scroll-locked');
    expect(shell).toHaveClass('cf-scroll-locked');

    // Close record drawer
    fireEvent.click(screen.getByRole('button', { name: 'Close record details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(document.body).not.toHaveClass('cf-scroll-locked');
    expect(shell).not.toHaveClass('cf-scroll-locked');

    // Open OrderWorkflowModal (New Order)
    const newOrderBtn = screen.getByRole('button', { name: 'New Order' });
    fireEvent.click(newOrderBtn);
    await screen.findByRole('dialog');

    expect(document.body).toHaveClass('cf-scroll-locked');
    expect(shell).toHaveClass('cf-scroll-locked');

    // Close order workflow modal
    fireEvent.click(screen.getByRole('button', { name: 'Close order workflow' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(document.body).not.toHaveClass('cf-scroll-locked');
    expect(shell).not.toHaveClass('cf-scroll-locked');

    // Test in mobile preview mode (.cf-preview-mobile)
    fireEvent.click(screen.getByRole('button', { name: 'Mobile preview' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!);
    await screen.findByRole('dialog');

    // Body should NOT be locked in mobile preview mode so host page is unaffected
    expect(document.body).not.toHaveClass('cf-scroll-locked');
    // But preview shell MUST be locked
    expect(shell).toHaveClass('cf-scroll-locked');

    fireEvent.click(screen.getByRole('button', { name: 'Close record details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(shell).not.toHaveClass('cf-scroll-locked');
  });

  it('supports Escape dismissal and restores focus to triggering element', async () => {
    mount('Orders');

    // Test RecordDrawer Escape dismissal and focus restoration
    const recordTrigger = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!;
    recordTrigger.focus();
    expect(recordTrigger).toHaveFocus();

    fireEvent.click(recordTrigger);
    const recordDialog = await screen.findByRole('dialog');
    expect(recordDialog).toBeInTheDocument();

    fireEvent.keyDown(recordDialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(recordTrigger).toHaveFocus();
    expect(document.body).not.toHaveClass('cf-scroll-locked');

    // Test OrderWorkflowModal Escape dismissal and focus restoration
    const orderTrigger = screen.getByRole('button', { name: 'New Order' });
    orderTrigger.focus();
    expect(orderTrigger).toHaveFocus();

    fireEvent.click(orderTrigger);
    const orderDialog = await screen.findByRole('dialog');
    expect(orderDialog).toBeInTheDocument();

    fireEvent.keyDown(orderDialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(orderTrigger).toHaveFocus();
    expect(document.body).not.toHaveClass('cf-scroll-locked');
  });

  it('supports Escape dismissal and restores focus in mobile preview mode', async () => {
    mount('Orders');

    fireEvent.click(screen.getByRole('button', { name: 'Mobile preview' }));

    const trigger = screen.getAllByRole('button', { name: 'PO-NEXUS-881' })[0]!;
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    const shell = document.querySelector('.cf-shell');
    expect(shell).not.toHaveClass('cf-scroll-locked');
  });

  it('verifies critical CSS rules for mobile drawer and scroll-lock in styles.css', () => {
    const cssPath = path.resolve(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // body scroll lock
    expect(css).toMatch(/body\.cf-scroll-locked\s*\{[^}]*overflow:\s*hidden\s*!important/);

    // embedded mobile preview frame containment
    expect(css).toMatch(/\.cf-preview-mobile\s*>\s*\.cf-frame\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.cf-preview-mobile\s*>\s*\.cf-frame\s*\{[^}]*overflow:\s*hidden/);

    // embedded mobile preview shell scroll and scroll-lock
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-shell\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-shell\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-shell\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-shell\.cf-scroll-locked\s*\{[^}]*overflow:\s*hidden\s*!important/);

    // embedded mobile preview overlay and drawer positioning
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-overlay\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-overlay\s*\{[^}]*inset:\s*0/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-overlay\s*\{[^}]*z-index:\s*60/);

    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-drawer\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-drawer\s*\{[^}]*inset:\s*0/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-drawer\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-drawer\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.cf-preview-mobile\s+\.cf-drawer\s*\{[^}]*z-index:\s*61/);

    // narrow mobile media query drawer anchoring
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer\{[^}]*inset:\s*0/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer\{[^}]*width:\s*100%/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer\{[^}]*height:\s*100dvh/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer-header\{[^}]*display:\s*grid/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer-body\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/@media\(max-width:600px\)[\s\S]*?\.cf-drawer-footer\{[^}]*padding:/);
  });
});
