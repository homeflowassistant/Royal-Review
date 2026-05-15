import { useMemo, useState, useEffect, useRef } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  Link2,
  Trash2,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const STATUS_FILTERS = [
  { key: "stopped", label: "Stopped" },
  { key: "clicked", label: "Clicked" },
  { key: "dnc", label: "Do Not Contact" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];
type ContactStatus = "Follow up" | "Clicked" | "Do Not Contact" | "Finished" | "DND" | "";

function statusStyles(status: ContactStatus) {
  switch (status) {
    case "":
      return {
        label: "—",
        icon: CircleDot,
        className: "bg-slate-50 text-slate-500 border-slate-200",
      };
    case "Follow up":
      return {
        label: "Follow Up",
        icon: RefreshCw,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "Clicked":
      return {
        label: "Clicked",
        icon: CheckCircle2,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "Do Not Contact":
    case "DND":
      return {
        label: "DND",
        icon: Ban,
        className: "bg-orange-50 text-orange-700 border-orange-200",
      };
    case "Finished":
    default:
      return {
        label: "Finished",
        icon: CircleDot,
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

function StatusBadge({ status }: { status: ContactStatus }) {
  const style = statusStyles(status);
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      <Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}

// Enhanced contact type with calculated status
interface EnhancedContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  smsStatus: ContactStatus;
  emailStatus: ContactStatus;
  dateAdded: string;
}

export default function ContactsPage() {
  const locationId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("locationId") || "";
  }, []);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<StatusFilter[]>([]);
  const [cursorHistory, setCursorHistory] = useState<(string[] | undefined)[]>([]);
  const [enhancedContacts, setEnhancedContacts] = useState<Map<string, ContactStatus>>(new Map());

  // Contact action states
  const [selectedContact, setSelectedContact] = useState<EnhancedContact | null>(null);
  const [actionType, setActionType] = useState<"view" | "edit" | "delete" | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    phone: "",
    dnd: false,
  });
  const lastStatusRefreshKeyRef = useRef<string>("");

  const currentCursor = cursorHistory[cursorHistory.length - 1];

  const connectionQuery = trpc.ghl.connectionStatus.useQuery(
    { locationId },
    { enabled: !!locationId, refetchInterval: 60000 }
  );

  const contactsQuery = trpc.ghl.listContacts.useQuery(
    {
      locationId,
      query: appliedSearch,
      pageLimit: 25,
      searchAfter: currentCursor,
      statusFilters: activeFilters,
    },
    {
      enabled: !!locationId && connectionQuery.data?.connected === true,
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
    }
  );

  const refreshContactStatusMutation = trpc.ghl.refreshContactStatus.useMutation();
  const updateContactMutation = trpc.ghl.updateContact.useMutation();
  const deleteContactMutation = trpc.ghl.deleteContact.useMutation();

  // Enhance contacts with opportunity-based status
  useEffect(() => {
    const enhanceContacts = async () => {
      if (!contactsQuery.data?.contacts?.length) return;

      const refreshKey = `${locationId}:${contactsQuery.data.contacts.map((contact) => contact.id).join(",")}`;
      if (lastStatusRefreshKeyRef.current === refreshKey) {
        return;
      }
      lastStatusRefreshKeyRef.current = refreshKey;

      const enhanced = new Map<string, ContactStatus>();

      await Promise.all(
        contactsQuery.data.contacts.map(async (contact) => {
          try {
            const result = await refreshContactStatusMutation.mutateAsync({
              locationId,
              contactId: contact.id,
            });

            const displayStatus = result.status || (contact.smsStatus as ContactStatus) || "";
            enhanced.set(contact.id, displayStatus as ContactStatus);
          } catch (error) {
            console.error(
              `[Contacts] Error checking won opportunities for contact ${contact.id}:`,
              error
            );
            // Fall back to default status
            enhanced.set(contact.id, contact.smsStatus as ContactStatus);
          }
        })
      );

      setEnhancedContacts(enhanced);
    };

    enhanceContacts();
  }, [contactsQuery.data?.contacts, locationId, refreshContactStatusMutation]);

  const isLoading = connectionQuery.isLoading || contactsQuery.isLoading;
  const isError = connectionQuery.isError || contactsQuery.isError;
  const errorMessage =
    (connectionQuery.error instanceof Error && connectionQuery.error.message) ||
    (contactsQuery.error instanceof Error && contactsQuery.error.message) ||
    undefined;

  const totalContacts = contactsQuery.data?.pagination.total ?? 0;
  const canGoNext = Boolean(contactsQuery.data?.pagination.searchAfter?.length);
  const canGoPrev = cursorHistory.length > 0;
  const contacts = contactsQuery.data?.contacts ?? [];

  // Map base contacts to enhanced contacts
  const displayContacts: EnhancedContact[] = contacts.map((contact) => ({
    ...contact,
    smsStatus: enhancedContacts.get(contact.id) || (contact.smsStatus as ContactStatus),
    emailStatus: enhancedContacts.get(contact.id) || (contact.emailStatus as ContactStatus),
  }));

  const handleSearch = () => {
    setAppliedSearch(searchInput.trim());
    setCursorHistory([]);
  };

  const handleClear = () => {
    setSearchInput("");
    setAppliedSearch("");
    setActiveFilters([]);
    setCursorHistory([]);
  };

  const toggleFilter = (filter: StatusFilter) => {
    setCursorHistory([]);
    setActiveFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter]
    );
  };

  // Contact action handlers
  const handleOpenMenu = (contact: EnhancedContact, type: "view" | "edit" | "delete") => {
    setSelectedContact(contact);
    setActionType(type);

    if (type === "edit") {
      const parts = contact.name.split(" ");
      setEditForm({
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        dnd: contact.smsStatus === "DND" || contact.smsStatus === "Do Not Contact",
      });
    }

    setIsDialogOpen(true);
  };

  const handleEditContact = async () => {
    if (!selectedContact) return;

    try {
      setIsRefreshing(true);
      console.log("Updating contact:", {
        locationId,
        contactId: selectedContact.id,
        firstName: editForm.firstName.trim() || undefined,
        lastName: editForm.lastName.trim() || undefined,
        name: editForm.name.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        dnd: editForm.dnd,
      });

      await updateContactMutation.mutateAsync({
        locationId,
        contactId: selectedContact.id,
        firstName: editForm.firstName.trim() || undefined,
        lastName: editForm.lastName.trim() || undefined,
        name: editForm.name.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        dnd: editForm.dnd,
      });

      console.log("Contact updated successfully");
      
      // Clear the enhanced contacts cache to force re-calculation
      setEnhancedContacts(new Map());
      lastStatusRefreshKeyRef.current = "";
      
      // Refetch the contacts list with fresh data
      await contactsQuery.refetch();
      
      toast.success("Contact updated successfully");
      setIsDialogOpen(false);
      setSelectedContact(null);
    } catch (error) {
      console.error("Error editing contact:", error);
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      console.error("Detailed error:", errorMessage);
      toast.error("Failed to edit contact", {
        description: errorMessage,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;

    try {
      setIsRefreshing(true);
      console.log("Deleting contact:", {
        locationId,
        contactId: selectedContact.id,
      });

      await deleteContactMutation.mutateAsync({
        locationId,
        contactId: selectedContact.id,
      });

      console.log("Contact deleted successfully");
      
      // Clear the enhanced contacts cache to force re-calculation
      setEnhancedContacts(new Map());
      lastStatusRefreshKeyRef.current = "";
      
      // Refetch the contacts list with fresh data
      await contactsQuery.refetch();
      
      toast.success("Contact deleted successfully");
      setIsDialogOpen(false);
      setSelectedContact(null);
    } catch (error) {
      console.error("Error deleting contact:", error);
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      console.error("Detailed error:", errorMessage);
      toast.error("Failed to delete contact", {
        description: errorMessage,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!locationId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Link2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">ReviewHarvest Contacts</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This page is designed to be embedded inside GoHighLevel. Add it as a
            Custom Menu Link with the <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">?locationId=YOUR_LOCATION_ID&amp;view=contacts</code>
            parameter.
          </p>
          <div className="bg-muted/50 border rounded-lg p-4 text-left">
            <p className="text-xs font-medium text-foreground mb-2">Example URL:</p>
            <code className="text-xs text-muted-foreground break-all">
              {window.location.origin}/?locationId=abc123xyz&amp;view=contacts
            </code>
          </div>
        </div>
      </div>
    );
  }

  if (connectionQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Checking connection...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-rose-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">API Connection Error</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We were unable to contact the backend to load the contacts page.
          </p>
          {errorMessage ? <p className="text-xs text-muted-foreground">{errorMessage}</p> : null}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => connectionQuery.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!connectionQuery.data?.connected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">App Not Connected</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This GoHighLevel sub-account (<code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{locationId}</code>) has not installed the app yet.
          </p>
          <Button variant="outline" onClick={() => connectionQuery.refetch()} className="mt-2">
            Check Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground leading-none">Contacts</h1>
              <p className="text-xs text-muted-foreground truncate">Location {locationId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{totalContacts} total contacts</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <section className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                  placeholder="Search contacts..."
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSearch} className="gap-2">
                  <Search className="h-4 w-4" />
                  Search
                </Button>
                <Button variant="outline" onClick={handleClear} className="gap-2">
                  <X className="h-4 w-4" />
                  Clear All
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Filters:</span>
              <span className="font-medium text-foreground">({totalContacts} total contacts)</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => {
              const active = activeFilters.includes(filter.key);
              return (
                <Button
                  key={filter.key}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleFilter(filter.key)}
                  className="rounded-full"
                >
                  {filter.label}
                </Button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>SMS Status</TableHead>
                <TableHead>Email Status</TableHead>
                <TableHead>Date Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading contacts...
                    </div>
                  </TableCell>
                </TableRow>
              ) : displayContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                    No contacts found for the current search and filters.
                  </TableCell>
                </TableRow>
              ) : (
                displayContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium text-foreground">{contact.name}</TableCell>
                    <TableCell>{contact.phone || "-"}</TableCell>
                    <TableCell>{contact.email || "-"}</TableCell>
                    <TableCell><StatusBadge status={contact.smsStatus} /></TableCell>
                    <TableCell><StatusBadge status={contact.emailStatus} /></TableCell>
                    <TableCell>
                      {new Date(contact.dateAdded).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleOpenMenu(contact, "view")}
                            className="cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            <span>View Details</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenMenu(contact, "edit")}
                            className="cursor-pointer"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            <span>Edit Contact</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenMenu(contact, "delete")}
                            className="cursor-pointer text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            <span>Delete Contact</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <div>
              Showing {displayContacts.length} contact{displayContacts.length === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCursorHistory((current) => current.slice(0, -1))} disabled={!canGoPrev} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextCursor = contactsQuery.data?.pagination.searchAfter;
                  if (!nextCursor) return;
                  setCursorHistory((current) => [...current, nextCursor]);
                }}
                disabled={!canGoNext}
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Contact Action Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          {actionType === "view" && selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle>Contact Details</DialogTitle>
                <DialogDescription>
                  View information for {selectedContact.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="text-foreground">{selectedContact.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-foreground">{selectedContact.phone || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-foreground">{selectedContact.email || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">SMS Status</label>
                  <div className="mt-1">
                    <StatusBadge status={selectedContact.smsStatus} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email Status</label>
                  <div className="mt-1">
                    <StatusBadge status={selectedContact.emailStatus} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date Added</label>
                  <p className="text-foreground">
                    {new Date(selectedContact.dateAdded).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </>
          )}

          {actionType === "edit" && selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Contact</DialogTitle>
                <DialogDescription>
                  Edit information for {selectedContact.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Contact name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-first-name">First Name</Label>
                    <Input
                      id="edit-first-name"
                      value={editForm.firstName}
                      onChange={(event) => setEditForm((current) => ({ ...current, firstName: event.target.value }))}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-last-name">Last Name</Label>
                    <Input
                      id="edit-last-name"
                      value={editForm.lastName}
                      onChange={(event) => setEditForm((current) => ({ ...current, lastName: event.target.value }))}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Email address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Phone number"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">DND</p>
                    <p className="text-xs text-muted-foreground">Mark this contact as do not disturb</p>
                  </div>
                  <Switch
                    checked={editForm.dnd}
                    onCheckedChange={(checked) => setEditForm((current) => ({ ...current, dnd: checked }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={updateContactMutation.isPending || isRefreshing}>
                  Close
                </Button>
                <Button onClick={handleEditContact} disabled={updateContactMutation.isPending || isRefreshing} className="gap-2">
                  {isRefreshing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </>
          )}

          {actionType === "delete" && selectedContact && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600">Delete Contact</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete {selectedContact.name}?
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. The contact will be permanently deleted from GoHighLevel.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={deleteContactMutation.isPending || isRefreshing}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteContact} disabled={deleteContactMutation.isPending || isRefreshing} className="gap-2">
                  {isRefreshing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Delete Contact
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
