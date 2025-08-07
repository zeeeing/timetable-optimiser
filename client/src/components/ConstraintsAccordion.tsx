import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import { SECTIONS } from "@/lib/constraints";

const ConstraintsAccordion = () => {
  return (
    <Accordion type="single" collapsible>
      {SECTIONS.map(({ title, items }) => (
        <AccordionItem value={title}>
          <AccordionTrigger>{title}</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-2 list-disc pl-5">
              {items.map(({ label, text }) => (
                <li key={label}>
                  <p className="font-bold">{label}:</p>
                  {text}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default ConstraintsAccordion;
