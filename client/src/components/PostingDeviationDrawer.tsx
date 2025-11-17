import React from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export type PostingPreviewRow = {
  posting_code: string;
  posting_name: string;
  posting_type: string;
  max_residents: number;
  required_block_duration: number;
  hc16_max_deviation: number;
};

type Props = {
  open: boolean;
  postings: PostingPreviewRow[];
  draft: Record<string, number>;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => void;
  onChange: (postingCode: string, value: string) => void;
};

const PostingDeviationDrawer: React.FC<Props> = ({
  open,
  postings,
  draft,
  onOpenChange,
  onCancel,
  onSave,
  onReset,
  onChange,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Posting balance tolerance</SheetTitle>
          <SheetDescription>
            Control how much imbalance (max residents − min residents) is
            allowed per posting in each half-year.
          </SheetDescription>
        </SheetHeader>
        {postings.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            Upload a postings.csv file to configure imbalance tolerance.
          </p>
        ) : (
          <div className="px-4 pb-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              A value of 0 enforces perfect balance. Higher numbers allow
              greater deviation between the busiest and quietest blocks.
            </p>
            <div className="border rounded-lg">
              <div className="grid grid-cols-[0.9fr,1.3fr,0.9fr,0.6fr,0.8fr] gap-2 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground bg-muted/50 border-b">
                <span>Posting</span>
                <span>Name</span>
                <span>Type</span>
                <span>Capacity</span>
                <span>Allowed Δ</span>
              </div>
              <div className="max-h-[65vh] overflow-y-auto divide-y">
                {postings.map((posting) => (
                  <div
                    key={posting.posting_code}
                    className="grid grid-cols-[0.9fr,1.3fr,0.9fr,0.6fr,0.8fr] gap-2 px-4 py-3 items-center"
                  >
                    <div className="font-medium text-sm">
                      {posting.posting_code}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {posting.posting_name || "—"}
                    </div>
                    <div className="text-sm">{posting.posting_type || "—"}</div>
                    <div className="text-sm">{posting.max_residents}</div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="text-sm"
                      value={
                        draft[posting.posting_code] ??
                        (posting.posting_code.startsWith("GM") ||
                          posting.posting_code.startsWith("ED"))
                          ? 4
                          : 0
                      }
                      onChange={(event) =>
                        onChange(posting.posting_code, event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <SheetFooter className="gap-3">
          <div className="flex flex-wrap gap-2 justify-between w-full">
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              disabled={postings.length === 0}
            >
              Reset to CSV defaults
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={postings.length === 0}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onSave}
                disabled={postings.length === 0}
              >
                Save changes
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default PostingDeviationDrawer;
