import catalog from "@/t2qcal/lib/native-catalog.json";
import {ResourcesLibrary} from "@/t2qcal/components/ResourcesLibrary";
import type {LibraryResource} from "@/t2qcal/lib/resource-library";
export default function ResourcesPage(){return <ResourcesLibrary resources={catalog.resources as LibraryResource[]}/>;}
