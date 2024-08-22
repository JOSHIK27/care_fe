import * as Notification from "../../Utils/Notifications";

import { Cancel, Submit } from "../Common/components/ButtonV2";
import { useCallback, useEffect, useState } from "react";

import CareIcon from "../../CAREUI/icons/CareIcon";
import ClaimDetailCard from "../HCX/ClaimDetailCard";
import { ConsultationModel } from "./models";
import CreateClaimCard from "../HCX/CreateClaimCard";
import { DISCHARGE_REASONS } from "../../Common/constants";
import DialogModal from "../Common/Dialog";
import { FieldLabel } from "../Form/FormFields/FormField";
import { HCXActions } from "../../Redux/actions";
import { HCXClaimModel } from "../HCX/models";
import { SelectFormField } from "../Form/FormFields/SelectFormField";
import TextAreaFormField from "../Form/FormFields/TextAreaFormField";
import TextFormField from "../Form/FormFields/TextFormField";
import { dischargePatient } from "../../Redux/actions";
import useConfig from "../../Common/hooks/useConfig";
import { useDispatch } from "react-redux";
import { useMessageListener } from "../../Common/hooks/useMessageListener";
import PrescriptionBuilder from "../Medicine/PrescriptionBuilder";
import CircularProgress from "../Common/components/CircularProgress";
import { FacilitySelect } from "../Common/FacilitySelect";
import { FacilityModel } from "./models";
import dayjs from "../../Utils/dayjs";
import { FieldError } from "../Form/FieldValidators";
import { useTranslation } from "react-i18next";
import useConfirmedAction from "../../Common/hooks/useConfirmedAction";
import ConfirmDialog from "../Common/ConfirmDialog";
import routes from "../../Redux/api";
import useQuery from "../../Utils/request/useQuery";
import { EditDiagnosesBuilder } from "../Diagnosis/ConsultationDiagnosisBuilder/ConsultationDiagnosisBuilder";
import { ConsultationDiagnosis } from "../Diagnosis/types";

interface PreDischargeFormInterface {
  new_discharge_reason: number | null;
  discharge_notes: string;
  discharge_date?: string;
  death_datetime?: string;
  death_confirmed_doctor?: string;
  referred_to?: string | null | undefined;
  referred_to_external?: string | null | undefined;
}

interface IProps {
  show: boolean;
  onClose: () => void;
  consultationData: ConsultationModel;
  referred_to?: FacilityModel | null;
  afterSubmit?: () => void;
  new_discharge_reason?: number | null;
  discharge_date?: string;
  death_datetime?: string;
}

const DischargeModal = ({
  show,
  onClose,
  consultationData,
  afterSubmit,
  new_discharge_reason = null,
  referred_to = null,
  discharge_date = dayjs().format("YYYY-MM-DDTHH:mm"),
  death_datetime = dayjs().format("YYYY-MM-DDTHH:mm"),
}: IProps) => {
  const { t } = useTranslation();
  const { enable_hcx } = useConfig();

  const dispatch: any = useDispatch();
  const [preDischargeForm, setPreDischargeForm] =
    useState<PreDischargeFormInterface>({
      new_discharge_reason,
      discharge_notes: referred_to
        ? "Patient Shifted to another facility."
        : "",
      discharge_date,
      death_datetime,
      death_confirmed_doctor: undefined,
      referred_to_external: !referred_to?.id ? referred_to?.name : null,
      referred_to: referred_to?.id ? referred_to.id : null,
    });
  const [latestClaim, setLatestClaim] = useState<HCXClaimModel>();
  const [isCreateClaimLoading, setIsCreateClaimLoading] = useState(false);
  const [isSendingDischargeApi, setIsSendingDischargeApi] = useState(false);
  const [facility, setFacility] = useState<FacilityModel | null>(referred_to);
  const [errors, setErrors] = useState<any>({});
  console.log(preDischargeForm);

  useEffect(() => {
    setPreDischargeForm((prev) => ({
      ...prev,
      discharge_notes: referred_to
        ? "Patient Shifted to another facility."
        : "",
      referred_to_external: !referred_to?.id ? referred_to?.name : null,
      referred_to: referred_to?.id ? referred_to.id : null,
    }));

    setFacility(referred_to);
  }, [referred_to]);

  const { data } = useQuery(routes.getConsultation, {
    pathParams: {
      id: consultationData.id,
    },
  });

  const ConsultationDiagnosisList: ConsultationDiagnosis[] =
    data?.diagnoses?.map((diagnosis) => diagnosis) || [];

  const discharge_reason =
    new_discharge_reason ?? preDischargeForm.new_discharge_reason;

  const fetchLatestClaim = useCallback(async () => {
    const res = await dispatch(
      HCXActions.claims.list({
        ordering: "-modified_date",
        use: "claim",
        consultation: consultationData.id,
      }),
    );

    if (res?.data?.results?.length > 0) {
      setLatestClaim(res.data.results[0]);
      if (isCreateClaimLoading)
        Notification.Success({ msg: "Fetched Claim Approval Results" });
    } else {
      setLatestClaim(undefined);
      if (isCreateClaimLoading)
        Notification.Success({ msg: "Error Fetched Claim Approval Results" });
    }
    setIsCreateClaimLoading(false);
  }, [consultationData.id, dispatch]);

  useEffect(() => {
    fetchLatestClaim();
  }, [fetchLatestClaim]);

  useMessageListener((data) => {
    if (
      data.type === "MESSAGE" &&
      (data.from === "claim/on_submit" || data.from === "preauth/on_submit") &&
      data.message === "success"
    ) {
      fetchLatestClaim();
    }
  });

  const validate = () => {
    if (!new_discharge_reason && !discharge_reason) {
      setErrors({
        ...errors,
        new_discharge_reason: "Please select a reason for discharge",
      });
      return;
    }

    if (
      discharge_reason == DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
    ) {
      const newErrors: Record<string, FieldError> = {};

      if (!preDischargeForm.discharge_notes.trim()) {
        newErrors["discharge_notes"] = "Please enter the cause of death";
      }
      if (!preDischargeForm.death_confirmed_doctor?.trim()) {
        newErrors["death_confirmed_doctor"] = t("field_required");
      }

      if (Object.entries(newErrors).length) {
        setErrors({ ...errors, ...newErrors });
        return;
      }
    }

    return true;
  };

  const submitAction = useConfirmedAction(async () => {
    setIsSendingDischargeApi(true);
    const dischargeResponse = await dispatch(
      dischargePatient(
        {
          ...preDischargeForm,
          new_discharge_reason: discharge_reason,
          discharge_date: dayjs(preDischargeForm.discharge_date).toISOString(),
        },
        { id: consultationData.id },
      ),
    );
    setIsSendingDischargeApi(false);

    if (dischargeResponse?.status === 200) {
      Notification.Success({ msg: "Patient Discharged Successfully" });
      afterSubmit?.();
    }
  });

  const handleFacilitySelect = (selected?: FacilityModel) => {
    setFacility(selected ?? null);
    setPreDischargeForm((prev) => ({
      ...prev,
      referred_to: selected?.id ?? null,
      referred_to_external: !selected?.id ? selected?.name : null,
    }));
  };

  const encounterDuration = dayjs.duration(
    dayjs(
      preDischargeForm[
        discharge_reason ===
        DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
          ? "death_datetime"
          : "discharge_date"
      ],
    ).diff(consultationData.encounter_date),
  );

  const confirmationRequired = encounterDuration.asDays() >= 30;

  return (
    <>
      <ConfirmDialog
        {...submitAction.confirmationProps}
        title="Confirm Discharge"
        action="Acknowledge & Submit"
        variant="warning"
        className="md:max-w-xl"
      >
        <div className="flex flex-col gap-2 py-2 text-secondary-900">
          <p>
            Are you sure you want to close this encounter, noting that the
            patient has been admitted for{" "}
            <span className="font-bold text-black">
              {Math.ceil(encounterDuration.asDays())} days
            </span>
            {" ?"}
          </p>
          <p>
            By confirming, you acknowledge that no further edits can be made to
            this encounter and that the information entered is accurate to the
            best of your knowledge.
          </p>
        </div>
      </ConfirmDialog>
      <DialogModal
        title={
          <div>
            <p>Discharge patient from CARE</p>
            <span className="mt-1 flex gap-1 text-sm font-medium text-warning-500">
              <CareIcon icon="l-exclamation-triangle" className="text-base" />
              <p>
                {t("caution")}: {t("action_irreversible")}
              </p>
            </span>
          </div>
        }
        show={show}
        onClose={() => {
          if (!submitAction.confirmationProps.show) {
            onClose();
          }
        }}
        className="md:max-w-3xl"
      >
        <div className="mt-6 flex flex-col">
          <SelectFormField
            required
            label="Reason"
            name="discharge_reason"
            id="discharge_reason"
            value={discharge_reason}
            disabled={!!new_discharge_reason}
            options={DISCHARGE_REASONS}
            optionValue={({ id }) => id}
            optionLabel={({ text }) => text}
            onChange={(e) =>
              setPreDischargeForm((prev) => ({
                ...prev,
                new_discharge_reason: e.value,
              }))
            }
            error={errors?.new_discharge_reason}
          />
          {discharge_reason ===
            DISCHARGE_REASONS.find((i) => i.text == "Referred")?.id && (
            <div id="facility-referredto">
              <FieldLabel>Referred to</FieldLabel>
              <FacilitySelect
                name="referred_to"
                setSelected={(selected) =>
                  handleFacilitySelect(selected as FacilityModel | undefined)
                }
                disabled={!!referred_to}
                selected={facility ?? null}
                showAll
                freeText
                multiple={false}
                errors={errors?.referred_to}
                className="mb-4"
              />
            </div>
          )}
          <TextFormField
            name={
              discharge_reason ===
              DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
                ? "death_datetime"
                : "discharge_date"
            }
            label={
              discharge_reason ===
              DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
                ? "Date of Death"
                : "Date and Time of Discharge"
            }
            type="datetime-local"
            value={
              preDischargeForm[
                discharge_reason ===
                DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
                  ? "death_datetime"
                  : "discharge_date"
              ]
            }
            onChange={(e) => {
              const updates: Record<string, string | undefined> = {
                discharge_date: undefined,
                death_datetime: undefined,
              };
              updates[e.name] = e.value;
              setPreDischargeForm((form) => ({ ...form, ...updates }));
            }}
            required
            min={dayjs(consultationData?.encounter_date).format(
              "YYYY-MM-DDTHH:mm",
            )}
            max={dayjs().format("YYYY-MM-DDTHH:mm")}
            error={
              discharge_reason ===
              DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
                ? errors?.death_datetime
                : errors?.discharge_date
            }
          />

          {discharge_reason !==
            DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id && (
            <div id="diagnosis_at_discharge">
              <FieldLabel>Diagnosis at discharge</FieldLabel>
              <EditDiagnosesBuilder value={ConsultationDiagnosisList} />
            </div>
          )}

          {discharge_reason ===
            DISCHARGE_REASONS.find((i) => i.text == "Recovered")?.id && (
            <>
              <div className="mb-4">
                <FieldLabel>Discharge Prescription Medications</FieldLabel>
                <PrescriptionBuilder prescription_type="DISCHARGE" />
              </div>
              <div className="mb-4">
                <FieldLabel>Discharge PRN Prescriptions</FieldLabel>
                <PrescriptionBuilder prescription_type="DISCHARGE" is_prn />
              </div>
            </>
          )}
          {discharge_reason ===
            DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id && (
            <TextFormField
              name="death_confirmed_by"
              label="Confirmed By"
              error={errors.death_confirmed_doctor}
              value={preDischargeForm.death_confirmed_doctor ?? ""}
              onChange={(e) => {
                setPreDischargeForm((form) => {
                  return {
                    ...form,
                    death_confirmed_doctor: e.value,
                  };
                });
              }}
              required
              placeholder="Attending Doctor's Name and Designation"
            />
          )}
        </div>
        <TextAreaFormField
          required={
            discharge_reason ==
            DISCHARGE_REASONS.find((i) => i.text == "Expired")?.id
          }
          label={
            {
              "3": "Cause of death",
              "1": "Discharged Advice",
            }[discharge_reason ?? 0] ?? "Notes"
          }
          name="discharge_notes"
          value={preDischargeForm.discharge_notes}
          onChange={(e) =>
            setPreDischargeForm((prev) => ({
              ...prev,
              discharge_notes: e.value,
            }))
          }
          error={errors?.discharge_notes}
        />

        {enable_hcx && (
          // TODO: if policy and approved pre-auth exists
          <div className="my-5 rounded p-5 shadow">
            <h2 className="mb-2">Claim Insurance</h2>
            {latestClaim ? (
              <ClaimDetailCard claim={latestClaim} />
            ) : (
              <CreateClaimCard
                consultationId={consultationData.id ?? ""}
                patientId={consultationData.patient ?? ""}
                use="claim"
                isCreating={isCreateClaimLoading}
                setIsCreating={setIsCreateClaimLoading}
              />
            )}
          </div>
        )}

        <div className="py-4">
          <span className="text-secondary-700">
            {t("encounter_duration_confirmation")}{" "}
            <strong>{encounterDuration.humanize()}</strong>.
          </span>
        </div>
        <div className="cui-form-button-group">
          <Cancel onClick={onClose} />
          {isSendingDischargeApi ? (
            <CircularProgress />
          ) : (
            <Submit
              onClick={async () => {
                if (!validate()) {
                  return;
                }

                if (confirmationRequired) {
                  submitAction.requestConfirmation();
                  return;
                }

                submitAction.submit();
              }}
              label="Confirm Discharge"
              autoFocus
            />
          )}
        </div>
      </DialogModal>
    </>
  );
};

export default DischargeModal;
