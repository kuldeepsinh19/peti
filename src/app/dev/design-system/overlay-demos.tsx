"use client";

import { Button } from "@/shared/ui/button";
import { Modal, OverlayClose, Sheet } from "@/shared/ui/overlay";

export function OverlayDemos() {
  return (
    <div className="flex flex-wrap gap-4">
      <Modal
        title="Decline this request?"
        description="The renter will be told the dates are not available."
        trigger={<Button variant="secondary">Open modal</Button>}
        footer={
          <>
            <OverlayClose render={<Button variant="quiet">Keep it</Button>} />
            <OverlayClose render={<Button variant="danger">Decline</Button>} />
          </>
        }
      >
        <p className="text-graphite">
          Modals are for short confirmations. Escape or the close control dismisses them.
        </p>
      </Modal>
      <Sheet
        title="Filters"
        description="Bottom sheet on mobile, side panel on desktop."
        trigger={<Button variant="secondary">Open sheet</Button>}
        footer={<OverlayClose render={<Button className="w-full">Show results</Button>} />}
      >
        <p className="text-graphite">Sheets hold longer secondary content such as the explore filters.</p>
      </Sheet>
    </div>
  );
}
